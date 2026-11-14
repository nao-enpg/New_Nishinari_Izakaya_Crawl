import { createKeyStore } from "./firebase-keys.server";
import type { LoginDeps } from "./login.server";
import { verifyIdToken } from "./verify-id-token.server";

/**
 * Firebase の設定は wrangler.jsonc の vars から読む（どれも秘密情報ではない）。
 * - FIREBASE_PROJECT_ID: ID トークンの aud と iss の確認に使う
 * - FIREBASE_AUTH_DOMAIN: /__/auth/* の中継先（<サイト ID>.firebaseapp.com。2026-10-15 以降の作成ではランダムな文字が付くことがある）
 * - FIREBASE_API_KEY: ブラウザの SDK に渡す（Web API キーは公開される前提の値）
 * - SITE_ORIGIN: CSRF の確認に使うこのサイトのオリジン。リクエストの Host からは決めない
 */
// env によっては未設定なので、どれも省略されうる
export interface AuthEnv {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_AUTH_DOMAIN?: string;
  FIREBASE_API_KEY?: string;
  SITE_ORIGIN?: string;
}

type EnabledAuthEnv = Required<AuthEnv>;

// isolate の間は公開鍵を使い回す
const keys = createKeyStore();

export function authEnabled(env: AuthEnv): env is EnabledAuthEnv {
  return Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_AUTH_DOMAIN && env.FIREBASE_API_KEY && env.SITE_ORIGIN);
}

export function loginDeps(env: EnabledAuthEnv, db: D1Database): LoginDeps {
  return {
    db,
    origin: env.SITE_ORIGIN,
    verify: (token) => verifyIdToken(token, { projectId: env.FIREBASE_PROJECT_ID, keys }),
  };
}

/** ブラウザに渡す設定。authDomain は自サイトにして、/__/auth/* を中継する */
export function publicFirebaseConfig(env: EnabledAuthEnv) {
  return {
    apiKey: env.FIREBASE_API_KEY,
    projectId: env.FIREBASE_PROJECT_ID,
    authDomain: new URL(env.SITE_ORIGIN).host,
  };
}
