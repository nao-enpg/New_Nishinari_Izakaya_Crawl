import { env } from "cloudflare:workers";
import type { Route } from "./+types/poc.auth.session";
import { authEnabled, loginDeps } from "../lib/auth/config.server";
import { handleCreateSession } from "../lib/auth/login.server";

// PoC d: ID トークンを受け取ってセッションを作る口（POST のみ）
export async function action({ request }: Route.ActionArgs) {
  if (!authEnabled(env)) return new Response("Firebase の設定がありません", { status: 503 });
  return handleCreateSession(request, loginDeps(env, env.DB));
}
