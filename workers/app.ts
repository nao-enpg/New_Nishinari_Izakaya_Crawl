import { createRequestHandler } from "react-router";
import { isAuthProxyPath, proxyFirebaseAuth } from "../app/lib/auth/auth-proxy.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env) {
    // PoC d: /__/auth/* は React Router に渡さず、Firebase の authDomain へ中継する。
    // アプリのセキュリティヘッダーを付ける処理より前で返す（中継先のヘッダーを上書きしない）
    if (isAuthProxyPath(new URL(request.url).pathname)) {
      if (!env.FIREBASE_AUTH_DOMAIN) return new Response("Not Found", { status: 404 });
      return proxyFirebaseAuth(request, { authDomain: env.FIREBASE_AUTH_DOMAIN });
    }
    return requestHandler(request);
  },
  // PoC a: Cron（座標の30日更新など）を同じ Worker に同居させる
  async scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime).toISOString();
    ctx.waitUntil(
      env.DB.prepare("UPDATE izakayas SET coords_fetched_at = ?1 WHERE id = (SELECT MIN(id) FROM izakayas)")
        .bind(now)
        .run(),
    );
    console.log(`[scheduled] cron=${controller.cron} at ${now}`);
  },
} satisfies ExportedHandler<Env>;
