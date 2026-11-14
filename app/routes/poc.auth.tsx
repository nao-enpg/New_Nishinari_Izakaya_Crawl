import { env } from "cloudflare:workers";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/poc.auth";
import { authEnabled, publicFirebaseConfig } from "../lib/auth/config.server";
import { getSessionUser } from "../lib/auth/session.server";

/**
 * PoC d: Google ログインの実機検証ページ（iPhone の Safari、Android の Chrome）。
 * リダイレクト方式とポップアップ方式を選んでログインし、各段階の結果を画面に記録する。
 * Firebase の設定（wrangler.jsonc の vars）が無いときは、その旨だけを表示する。
 */

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getSessionUser(env.DB, request, Math.floor(Date.now() / 1000));
  const enabled = authEnabled(env);
  return {
    enabled,
    config: authEnabled(env) ? publicFirebaseConfig(env) : null,
    user: user ? { userId: user.userId, name: user.name } : null,
  };
}

export function headers() {
  return { "cache-control": "no-store" };
}

type Log = { at: string; text: string };

export default function PocAuth({ loaderData }: Route.ComponentProps) {
  const { enabled, config, user } = loaderData;
  const [logs, setLogs] = useState<Log[]>([]);
  const started = useRef(false);
  const log = (text: string) => setLogs((l) => [...l, { at: new Date().toISOString().slice(11, 23), text }]);

  async function firebase() {
    const { initializeApp, getApps } = await import("firebase/app");
    const auth = await import("firebase/auth");
    const app = getApps()[0] ?? initializeApp(config!);
    const a = auth.getAuth(app);
    // サーバー側で自前のセッションを持つので、ブラウザ側のログイン状態はタブを閉じたら消えてよい
    await auth.setPersistence(a, auth.browserSessionPersistence);
    return { a, auth };
  }

  async function createSession(idToken: string) {
    const res = await fetch("/poc/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
      credentials: "same-origin",
    });
    log(`セッション作成: HTTP ${res.status} ${await res.text()}`);
    if (res.ok) {
      const { a, auth } = await firebase();
      await auth.signOut(a); // ブラウザ側の Firebase のログイン状態は残さない
      location.reload();
    }
  }

  // リダイレクト方式から戻ってきたとき
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    log(`UA: ${navigator.userAgent}`);
    (async () => {
      try {
        const { a, auth } = await firebase();
        const result = await auth.getRedirectResult(a);
        if (result) {
          log(`リダイレクトの結果: uid=${result.user.uid.slice(0, 6)}…`);
          await createSession(await result.user.getIdToken());
        } else {
          log("リダイレクトの結果: なし");
        }
      } catch (e) {
        log(`リダイレクトの結果でエラー: ${(e as { code?: string }).code ?? String(e)}`);
      }
    })();
  }, [enabled]);

  async function signIn(mode: "redirect" | "popup") {
    try {
      const { a, auth } = await firebase();
      const provider = new auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      log(`${mode} でログイン開始`);
      if (mode === "redirect") {
        await auth.signInWithRedirect(a, provider);
        return;
      }
      const result = await auth.signInWithPopup(a, provider);
      log(`ポップアップの結果: uid=${result.user.uid.slice(0, 6)}…`);
      await createSession(await result.user.getIdToken());
    } catch (e) {
      log(`エラー: ${(e as { code?: string }).code ?? String(e)}`);
    }
  }

  async function logout() {
    const res = await fetch("/poc/auth/logout", { method: "POST", credentials: "same-origin" });
    log(`ログアウト: HTTP ${res.status}`);
    if (res.ok) location.reload();
  }

  return (
    <main className="mx-auto max-w-xl p-4 space-y-4">
      <h1 className="text-xl font-bold">PoC d: Google ログイン</h1>
      {!enabled ? (
        <p>Firebase の設定（FIREBASE_PROJECT_ID・FIREBASE_AUTH_DOMAIN・FIREBASE_API_KEY・SITE_ORIGIN）がありません。</p>
      ) : (
        <>
          <p>セッション: {user ? `ログイン中（${user.name}、ユーザー番号 ${user.userId}）` : "未ログイン"}</p>
          <div className="flex gap-2">
            <button className="rounded border px-3 py-2" onClick={() => signIn("redirect")}>リダイレクト方式</button>
            <button className="rounded border px-3 py-2" onClick={() => signIn("popup")}>ポップアップ方式</button>
            {user && <button className="rounded border px-3 py-2" onClick={logout}>ログアウト</button>}
          </div>
          <ol className="text-xs font-mono space-y-1">
            {logs.map((l, i) => (
              <li key={i}>
                {l.at} {l.text}
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
