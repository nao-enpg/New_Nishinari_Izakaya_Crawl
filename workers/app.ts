import { createRequestHandler } from "react-router";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
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
