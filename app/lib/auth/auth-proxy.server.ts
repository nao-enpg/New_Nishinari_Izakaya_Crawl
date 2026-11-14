/**
 * /__/auth/* を Firebase の authDomain へ中継する（Firebase Hosting 以外でリダイレクト方式のログインを使うため）。
 * Safari などの第三者ストレージの制限で、authDomain（*.firebaseapp.com）が別サイト扱いになるのを避ける。
 *
 * 守ること（工程計画 P1-5d）
 * - 中継先は設定の authDomain に固定する（リクエストからは決めない）。パスは /__/auth/ で始まるものだけ
 * - リダイレクトはたどらず、ブラウザへそのまま返す（authDomain 自身への転送だけは自サイトへ書き換える）
 * - キャッシュしない（Cache-Control: no-store。Cloudflare のキャッシュにも置かない）
 * - 中継先のセキュリティヘッダーを上書きしない（アプリ側のヘッダーを付ける処理より前で返す）
 * - 自サイトの Cookie や認証情報を中継先へ送らない。中継先の Set-Cookie も自サイトに付けない
 */

export const AUTH_PROXY_PREFIX = "/__/auth/";

// 中継先へ渡すリクエストヘッダー（これ以外は送らない）
const FORWARD_REQUEST_HEADERS = ["accept", "accept-language", "user-agent", "if-none-match", "if-modified-since"];

// 中継しないレスポンスヘッダー
const DROP_RESPONSE_HEADERS = ["set-cookie", "connection", "keep-alive", "transfer-encoding", "alt-svc"];

type Fetcher = (input: Request) => Promise<Response>;

export function isAuthProxyPath(pathname: string): boolean {
  return pathname.startsWith(AUTH_PROXY_PREFIX);
}

export async function proxyFirebaseAuth(
  request: Request,
  opts: { authDomain: string; fetcher?: Fetcher },
): Promise<Response> {
  const fetcher = opts.fetcher ?? ((r: Request) => fetch(r));
  const url = new URL(request.url);
  if (!isAuthProxyPath(url.pathname)) return new Response("Not Found", { status: 404 });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }

  const upstreamUrl = new URL(url.pathname + url.search, `https://${opts.authDomain}`);
  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const v = request.headers.get(name);
    if (v !== null) headers.set(name, v);
  }

  const upstream = await fetcher(
    new Request(upstreamUrl, { method: request.method, headers, redirect: "manual" }),
  );

  const out = new Headers(upstream.headers);
  for (const name of DROP_RESPONSE_HEADERS) out.delete(name);
  out.set("cache-control", "no-store");

  const location = upstream.headers.get("location");
  if (location) {
    const loc = new URL(location, upstreamUrl);
    // authDomain 自身への転送は、自サイトの同じパスへ向け直す（ブラウザが authDomain へ移らないように）
    if (loc.host === opts.authDomain) {
      out.set("location", url.origin + loc.pathname + loc.search + loc.hash);
    }
  }

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}
