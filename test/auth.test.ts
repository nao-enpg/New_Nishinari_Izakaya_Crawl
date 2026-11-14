import { env } from "cloudflare:workers";
import { SignJWT, importPKCS8, type JWTPayload } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createKeyStore, parseMaxAge, type KeyStore } from "../app/lib/auth/firebase-keys.server";
import { findOrLinkUser } from "../app/lib/auth/link-user.server";
import { handleCreateSession, handleLogout } from "../app/lib/auth/login.server";
import { getSessionUser, hashToken } from "../app/lib/auth/session.server";
import { IdTokenError, verifyIdToken, type VerifiedIdToken } from "../app/lib/auth/verify-id-token.server";
import { proxyFirebaseAuth } from "../app/lib/auth/auth-proxy.server";
// テスト専用の鍵と自己署名証明書（本物の Firebase の鍵ではない）
import cert1 from "./fixtures/firebase/test-cert-1.pem?raw";
import key1Pem from "./fixtures/firebase/test-key-1.pem?raw";
import key2Pem from "./fixtures/firebase/test-key-2.pem?raw";
// 2026-11-14 に取得した本物の公開鍵（公開情報）。workerd で X.509 を読み込めるかの確認に使う
import realCerts from "./fixtures/firebase/google-securetoken-certs-2026-11-14.json";

const db = env.DB;
const PROJECT = "nishinari-test";
const ORIGIN = "https://nishinari.example";
const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);
const nowSec = Math.floor(NOW / 1000);
const GOOGLE_SUB = "123456789012345678901";

function certsResponse(body: Record<string, string>, maxAge = 3600) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${maxAge}, must-revalidate` },
  });
}

function testKeyStore(now = () => NOW): KeyStore {
  return createKeyStore({ fetcher: async () => certsResponse({ "kid-1": cert1 }), now });
}

function claims(overrides: Record<string, unknown> = {}): JWTPayload {
  return {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: "firebase-uid-1",
    iat: nowSec - 10,
    exp: nowSec + 3600,
    auth_time: nowSec - 10,
    name: "テスト太郎",
    email: "taro@example.com",
    email_verified: true,
    firebase: { sign_in_provider: "google.com", identities: { "google.com": [GOOGLE_SUB], email: ["taro@example.com"] } },
    ...overrides,
  };
}

async function sign(payload: JWTPayload, opts: { kid?: string; keyPem?: string } = {}) {
  const key = await importPKCS8(opts.keyPem ?? key1Pem, "RS256");
  return new SignJWT(payload).setProtectedHeader({ alg: "RS256", kid: opts.kid ?? "kid-1", typ: "JWT" }).sign(key);
}

function b64url(s: string) {
  const bin = String.fromCharCode(...new TextEncoder().encode(s));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(IdTokenError);
  await expect(p).rejects.toMatchObject({ code });
}

const verify = (token: string, keys = testKeyStore()) => verifyIdToken(token, { projectId: PROJECT, keys, now: () => NOW });

describe("PoC d: ID トークンの検証（jose）", () => {
  it("正しいトークンを受け付け、uid と Google アカウントの ID を取り出す", async () => {
    const result = await verify(await sign(claims()));
    expect(result).toEqual({
      uid: "firebase-uid-1",
      googleSub: GOOGLE_SUB,
      email: "taro@example.com",
      emailVerified: true,
      name: "テスト太郎",
      authTime: nowSec - 10,
    });
  });

  it("aud・iss が別のプロジェクトなら拒否する", async () => {
    await expectCode(verify(await sign(claims({ aud: "other-project" }))), "claim_invalid");
    await expectCode(verify(await sign(claims({ iss: "https://securetoken.google.com/other-project" }))), "claim_invalid");
  });

  it("期限切れ・iat が未来・auth_time が未来・auth_time が無いものを拒否する", async () => {
    await expectCode(verify(await sign(claims({ exp: nowSec - 120 }))), "expired");
    await expectCode(verify(await sign(claims({ iat: nowSec + 600 }))), "claim_invalid");
    await expectCode(verify(await sign(claims({ auth_time: nowSec + 600 }))), "claim_invalid");
    await expectCode(verify(await sign(claims({ auth_time: undefined }))), "claim_invalid");
  });

  it("sub が空なら拒否する", async () => {
    await expectCode(verify(await sign(claims({ sub: "" }))), "claim_invalid");
  });

  it("Google 以外のログイン（匿名・メールなど）を拒否する", async () => {
    await expectCode(
      verify(await sign(claims({ firebase: { sign_in_provider: "anonymous", identities: {} } }))),
      "not_google",
    );
    await expectCode(
      verify(await sign(claims({ firebase: { sign_in_provider: "google.com", identities: {} } }))),
      "not_google",
    );
  });

  it("alg の差し替え（none、公開鍵を秘密鍵に見立てた HS256）を拒否する", async () => {
    const none = `${b64url(JSON.stringify({ alg: "none", kid: "kid-1" }))}.${b64url(JSON.stringify(claims()))}.`;
    await expectCode(verify(none), "unsupported_alg");
    const hs = await new SignJWT(claims())
      .setProtectedHeader({ alg: "HS256", kid: "kid-1" })
      .sign(new TextEncoder().encode(cert1));
    await expectCode(verify(hs), "unsupported_alg");
  });

  it("同じ kid で別の鍵が署名したものを拒否する", async () => {
    await expectCode(verify(await sign(claims(), { keyPem: key2Pem })), "bad_signature");
  });

  it("知らない kid を拒否する", async () => {
    await expectCode(verify(await sign(claims(), { kid: "kid-unknown" })), "unknown_kid");
  });

  it("壊れた文字列を拒否する", async () => {
    await expectCode(verify("not-a-jwt"), "malformed");
  });
});

describe("PoC d: 公開鍵の取得と保持", () => {
  it("Cache-Control の max-age を読む", () => {
    expect(parseMaxAge("public, max-age=23463, must-revalidate, no-transform")).toBe(23463);
    expect(parseMaxAge("no-cache")).toBeNull();
    expect(parseMaxAge(null)).toBeNull();
  });

  it("max-age の間は取り直さず、過ぎたら取り直す", async () => {
    let t = NOW;
    const keys = createKeyStore({ fetcher: async () => certsResponse({ "kid-1": cert1 }, 100), now: () => t });
    expect(await keys.get("kid-1")).not.toBeNull();
    t += 99_000;
    await keys.get("kid-1");
    expect(keys.fetchCount).toBe(1);
    t += 2_000;
    await keys.get("kid-1");
    expect(keys.fetchCount).toBe(2);
  });

  it("同時に来ても1回しか取りに行かない", async () => {
    const keys = testKeyStore();
    await Promise.all([keys.get("kid-1"), keys.get("kid-1"), keys.get("kid-1")]);
    expect(keys.fetchCount).toBe(1);
  });

  it("知らない kid では、間隔を空けて1回だけ取り直す（でたらめな kid で取りに行かせ続けられない）", async () => {
    let t = NOW;
    const keys = createKeyStore({
      fetcher: async () => certsResponse({ "kid-1": cert1 }),
      now: () => t,
      minRefetchIntervalSeconds: 60,
    });
    expect(await keys.get("kid-x")).toBeNull(); // 初回の取得
    expect(await keys.get("kid-y")).toBeNull(); // 60秒以内なので取りに行かない
    expect(keys.fetchCount).toBe(1);
    t += 61_000;
    expect(await keys.get("kid-z")).toBeNull(); // 60秒を過ぎたので1回取り直す
    expect(keys.fetchCount).toBe(2);
  });

  it("本物の公開鍵（2026-11-14 取得）を workerd で読み込める。テスト用の鍵の署名はそれでは通らない", async () => {
    const keys = createKeyStore({ fetcher: async () => certsResponse(realCerts as Record<string, string>), now: () => NOW });
    const kids = Object.keys(realCerts);
    expect(kids.length).toBeGreaterThan(0);
    for (const kid of kids) expect(await keys.get(kid)).not.toBeNull();
    await expectCode(verify(await sign(claims(), { kid: kids[0] }), keys), "bad_signature");
  });
});

async function resetDb() {
  await db.batch(
    ["sessions", "favorites", "izakaya_plans", "plans", "users"].map((t) => db.prepare(`DELETE FROM ${t}`)),
  );
}

function verified(overrides: Partial<VerifiedIdToken> = {}): VerifiedIdToken {
  return {
    uid: "firebase-uid-1",
    googleSub: GOOGLE_SUB,
    email: "taro@example.com",
    emailVerified: true,
    name: "テスト太郎",
    authTime: nowSec - 10,
    ...overrides,
  };
}

describe("PoC d: 旧ユーザーとの紐付け", () => {
  beforeEach(resetDb);
  afterEach(resetDb);
  const nowIso = new Date(NOW).toISOString();

  it("google_sub が一致する旧ユーザーに firebase_uid を書き込み、次からはそのユーザーとして扱う", async () => {
    await db
      .prepare("INSERT INTO users (id, name, google_sub, updated_at) VALUES (7, '旧ユーザー', ?1, ?2)")
      .bind(GOOGLE_SUB, nowIso)
      .run();
    expect(await findOrLinkUser(db, verified(), nowIso)).toEqual({ kind: "linked_legacy", userId: 7 });
    expect(await findOrLinkUser(db, verified(), nowIso)).toEqual({ kind: "existing", userId: 7 });
    const row = await db.prepare("SELECT name, firebase_uid FROM users WHERE id = 7").first();
    expect(row).toEqual({ name: "旧ユーザー", firebase_uid: "firebase-uid-1" });
  });

  it("旧ユーザーがいなければ新しく作る", async () => {
    const r = await findOrLinkUser(db, verified(), nowIso);
    expect(r.kind).toBe("created");
    const row = await db.prepare("SELECT name, firebase_uid, google_sub FROM users WHERE id = ?1").bind(r.userId).first();
    expect(row).toEqual({ name: "テスト太郎", firebase_uid: "firebase-uid-1", google_sub: GOOGLE_SUB });
  });

  it("google_sub が別の firebase_uid に紐付いていたら、勝手に付け替えない", async () => {
    await db
      .prepare("INSERT INTO users (id, name, firebase_uid, google_sub, updated_at) VALUES (8, 'x', 'other-uid', ?1, ?2)")
      .bind(GOOGLE_SUB, nowIso)
      .run();
    await expect(findOrLinkUser(db, verified(), nowIso)).rejects.toThrow();
    const row = await db.prepare("SELECT firebase_uid FROM users WHERE id = 8").first();
    expect(row).toEqual({ firebase_uid: "other-uid" });
  });
});

describe("PoC d: セッションを作る口（CSRF 対策つき）", () => {
  beforeEach(resetDb);
  afterEach(resetDb);

  const deps = (overrides: Partial<Parameters<typeof handleCreateSession>[1]> = {}) => ({
    db,
    origin: ORIGIN,
    now: () => NOW,
    verify: async (t: string) => verifyIdToken(t, { projectId: PROJECT, keys: testKeyStore(), now: () => NOW }),
    ...overrides,
  });

  async function post(body: unknown, headers: Record<string, string> = {}) {
    return new Request(`${ORIGIN}/poc/auth/session`, {
      method: "POST",
      headers: { origin: ORIGIN, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("正しいトークンでセッションを作り、Cookie を返す。DB にはトークンのハッシュだけが入る", async () => {
    const res = await handleCreateSession(await post({ idToken: await sign(claims()) }), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^__Host-session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=1209600$/);
    const token = setCookie.split(";")[0].split("=")[1];

    const rows = await db.prepare("SELECT id_hash, expires_at FROM sessions").all<{ id_hash: string; expires_at: number }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].id_hash).toBe(await hashToken(token));
    expect(rows.results[0].id_hash).not.toContain(token);
    expect(rows.results[0].expires_at).toBe(nowSec + 1209600);

    const me = await getSessionUser(db, new Request(ORIGIN, { headers: { cookie: `a=b; __Host-session=${token}` } }), nowSec);
    expect(me).toMatchObject({ name: "テスト太郎" });
    // 期限を過ぎたら読めない
    expect(await getSessionUser(db, new Request(ORIGIN, { headers: { cookie: `__Host-session=${token}` } }), nowSec + 1209600)).toBeNull();
  });

  it("Origin が違う・無い、Sec-Fetch-Site が cross-site のときは 403", async () => {
    const idToken = await sign(claims());
    expect((await handleCreateSession(await post({ idToken }, { origin: "https://evil.example" }), deps())).status).toBe(403);
    const noOrigin = await post({ idToken });
    noOrigin.headers.delete("origin");
    expect((await handleCreateSession(noOrigin, deps())).status).toBe(403);
    expect((await handleCreateSession(await post({ idToken }, { "sec-fetch-site": "cross-site" }), deps())).status).toBe(403);
    expect((await db.prepare("SELECT count(*) AS n FROM sessions").first())?.n).toBe(0);
  });

  it("JSON 以外（別のサイトのフォームから送れる形式）は 415", async () => {
    const res = await handleCreateSession(
      await post(`idToken=${await sign(claims())}`, { "content-type": "application/x-www-form-urlencoded" }),
      deps(),
    );
    expect(res.status).toBe(415);
  });

  it("ログインから5分を過ぎたトークンではセッションを作らない", async () => {
    const res = await handleCreateSession(await post({ idToken: await sign(claims({ auth_time: nowSec - 301 })) }), deps());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "stale_login" });
  });

  it("不正なトークンは 401 で、理由のコードだけを返す", async () => {
    const res = await handleCreateSession(await post({ idToken: await sign(claims(), { keyPem: key2Pem }) }), deps());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "bad_signature" });
  });

  it("GET は 405", async () => {
    const res = await handleCreateSession(new Request(`${ORIGIN}/poc/auth/session`), deps());
    expect(res.status).toBe(405);
  });

  it("ログアウトでセッションを消し、Cookie を消す。Origin が違えば消さない", async () => {
    const res = await handleCreateSession(await post({ idToken: await sign(claims()) }), deps());
    const token = (res.headers.get("set-cookie") ?? "").split(";")[0].split("=")[1];
    const logout = (origin: string) =>
      new Request(`${ORIGIN}/poc/auth/logout`, { method: "POST", headers: { origin, cookie: `__Host-session=${token}` } });

    expect((await handleLogout(logout("https://evil.example"), { db, origin: ORIGIN })).status).toBe(403);
    expect((await db.prepare("SELECT count(*) AS n FROM sessions").first())?.n).toBe(1);

    const out = await handleLogout(logout(ORIGIN), { db, origin: ORIGIN });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await db.prepare("SELECT count(*) AS n FROM sessions").first())?.n).toBe(0);
  });
});

describe("PoC d: /__/auth/* の中継", () => {
  const AUTH_DOMAIN = "nishinari-test.firebaseapp.com";

  function upstream(res: Response) {
    const seen: Request[] = [];
    return {
      seen,
      fetcher: async (r: Request) => {
        seen.push(r);
        return res;
      },
    };
  }

  it("authDomain の同じパスとクエリへ中継し、自サイトの Cookie や認証ヘッダーを送らない", async () => {
    const u = upstream(new Response("<html>handler</html>", { headers: { "content-type": "text/html" } }));
    const res = await proxyFirebaseAuth(
      new Request(`${ORIGIN}/__/auth/handler?apiKey=k&authType=signInViaRedirect`, {
        headers: { cookie: "__Host-session=secret", authorization: "Bearer x", "accept-language": "ja", "x-forwarded-for": "1.2.3.4" },
      }),
      { authDomain: AUTH_DOMAIN, fetcher: u.fetcher },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>handler</html>");
    const sent = u.seen[0];
    expect(sent.url).toBe(`https://${AUTH_DOMAIN}/__/auth/handler?apiKey=k&authType=signInViaRedirect`);
    expect(sent.redirect).toBe("manual");
    expect(sent.headers.get("cookie")).toBeNull();
    expect(sent.headers.get("authorization")).toBeNull();
    expect(sent.headers.get("x-forwarded-for")).toBeNull();
    expect(sent.headers.get("accept-language")).toBe("ja");
  });

  it("リダイレクトはたどらずに返す。authDomain 自身への転送だけ自サイトへ向け直す", async () => {
    const google = "https://accounts.google.com/o/oauth2/auth?client_id=x";
    let res = await proxyFirebaseAuth(new Request(`${ORIGIN}/__/auth/handler`), {
      authDomain: AUTH_DOMAIN,
      fetcher: upstream(new Response(null, { status: 302, headers: { location: google } })).fetcher,
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(google);

    res = await proxyFirebaseAuth(new Request(`${ORIGIN}/__/auth/handler`), {
      authDomain: AUTH_DOMAIN,
      fetcher: upstream(
        new Response(null, { status: 302, headers: { location: `https://${AUTH_DOMAIN}/__/auth/handler?x=1#f` } }),
      ).fetcher,
    });
    expect(res.headers.get("location")).toBe(`${ORIGIN}/__/auth/handler?x=1#f`);
  });

  it("キャッシュさせず、中継先の Set-Cookie は付けず、中継先のセキュリティヘッダーはそのまま返す", async () => {
    const res = await proxyFirebaseAuth(new Request(`${ORIGIN}/__/auth/iframe`), {
      authDomain: AUTH_DOMAIN,
      fetcher: upstream(
        new Response("ok", {
          headers: {
            "cache-control": "public, max-age=3600",
            "set-cookie": "x=1; Domain=firebaseapp.com",
            "content-security-policy": "frame-ancestors 'self'",
            "x-frame-options": "SAMEORIGIN",
          },
        }),
      ).fetcher,
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("GET・HEAD 以外は 405、/__/auth/ 以外のパスは 404 で、中継先へ送らない", async () => {
    const u = upstream(new Response("ok"));
    expect((await proxyFirebaseAuth(new Request(`${ORIGIN}/__/auth/handler`, { method: "POST" }), { authDomain: AUTH_DOMAIN, fetcher: u.fetcher })).status).toBe(405);
    expect((await proxyFirebaseAuth(new Request(`${ORIGIN}/__/firebase/init.json`), { authDomain: AUTH_DOMAIN, fetcher: u.fetcher })).status).toBe(404);
    expect(u.seen).toHaveLength(0);
  });

  it("パスに .. を含めても authDomain の /__/auth/ の外へは出られない", async () => {
    const u = upstream(new Response("ok"));
    const res = await proxyFirebaseAuth(new Request(`${ORIGIN}/__/auth/../../admin`), { authDomain: AUTH_DOMAIN, fetcher: u.fetcher });
    // URL の正規化で /admin になるので、中継の対象外
    expect(res.status).toBe(404);
    expect(u.seen).toHaveLength(0);
  });
});
