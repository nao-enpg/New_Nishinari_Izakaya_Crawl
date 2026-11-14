import { findOrLinkUser } from "./link-user.server";
import { clearSessionCookie, createSession, destroySession } from "./session.server";
import { IdTokenError, type VerifiedIdToken } from "./verify-id-token.server";

/**
 * セッションを作る口（POST、本文は JSON の {"idToken": "…"}）と、ログアウトの口（POST）。
 *
 * CSRF 対策
 * - Origin がこのサイトと一致すること（無いものも拒否する）。Sec-Fetch-Site があれば same-origin であること
 * - Content-Type が application/json であること（別のサイトのフォームからは送れず、fetch なら事前確認が要る）
 * - ID トークンのログイン時刻（auth_time）が直近であること（盗んだ古いトークンでセッションを作らせない）
 */

export interface LoginDeps {
  db: D1Database;
  /** このサイトのオリジン（例: https://nishinari-izakaya.net）。リクエストからは決めない */
  origin: string;
  verify: (idToken: string) => Promise<VerifiedIdToken>;
  now?: () => number;
  sessionTtlSeconds?: number;
  /** ログインしてからセッションを作れるまでの時間 */
  maxAuthAgeSeconds?: number;
}

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

export function checkSameOrigin(request: Request, origin: string): string | null {
  if (request.headers.get("origin") !== origin) return "origin_mismatch";
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return "cross_site";
  return null;
}

export async function handleCreateSession(request: Request, deps: LoginDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, { allow: "POST" });

  const csrf = checkSameOrigin(request, deps.origin);
  if (csrf) return json(403, { error: csrf });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json(415, { error: "json_required" });
  }

  const text = await request.text();
  if (text.length > 8192) return json(413, { error: "too_large" });
  let idToken: unknown;
  try {
    idToken = (JSON.parse(text) as { idToken?: unknown }).idToken;
  } catch {
    return json(400, { error: "bad_json" });
  }
  if (typeof idToken !== "string" || idToken.length === 0) return json(400, { error: "id_token_required" });

  let token: VerifiedIdToken;
  try {
    token = await deps.verify(idToken);
  } catch (e) {
    // トークンそのものはログに出さない
    if (e instanceof IdTokenError) return json(401, { error: e.code });
    throw e;
  }

  const nowSec = Math.floor(now() / 1000);
  if (nowSec - token.authTime > (deps.maxAuthAgeSeconds ?? 300)) return json(401, { error: "stale_login" });

  const link = await findOrLinkUser(deps.db, token, new Date(now()).toISOString());
  const { setCookie } = await createSession(deps.db, link.userId, {
    nowSec,
    ttlSeconds: deps.sessionTtlSeconds ?? 60 * 60 * 24 * 14,
  });
  return json(200, { userId: link.userId, result: link.kind }, { "set-cookie": setCookie });
}

export async function handleLogout(request: Request, deps: Pick<LoginDeps, "db" | "origin">): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, { allow: "POST" });
  const csrf = checkSameOrigin(request, deps.origin);
  if (csrf) return json(403, { error: csrf });
  await destroySession(deps.db, request);
  return json(200, { ok: true }, { "set-cookie": clearSessionCookie() });
}
