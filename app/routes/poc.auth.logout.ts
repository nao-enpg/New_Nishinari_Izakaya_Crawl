import { env } from "cloudflare:workers";
import type { Route } from "./+types/poc.auth.logout";
import { handleLogout } from "../lib/auth/login.server";

// PoC d: ログアウト（現行の DELETE /logout に当たる。ブラウザのフォームからは POST で送る）
export async function action({ request }: Route.ActionArgs) {
  return handleLogout(request, { db: env.DB, origin: env.SITE_ORIGIN ?? "" }); // 未設定なら Origin が一致せず 403
}
