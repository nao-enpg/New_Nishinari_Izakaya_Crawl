import { decodeProtectedHeader, errors, jwtVerify, type JWTPayload } from "jose";
import type { KeyStore } from "./firebase-keys.server";

/**
 * Firebase の ID トークンを、汎用の JWT ライブラリ（jose）で検証する。
 * Firebase の「サードパーティの JWT ライブラリでの検証」の手順にある項目を、すべて自前で確かめる。
 *   ヘッダー: alg = RS256、kid = 公開鍵のどれか
 *   本文: exp（未来）、iat（過去）、aud（プロジェクト ID）、iss（https://securetoken.google.com/<プロジェクト ID>）、
 *         sub（空でない文字列。uid）、auth_time（過去）
 * このサイトは Google ログインだけなので、firebase.sign_in_provider が google.com であることも確かめる。
 */

export interface VerifyOptions {
  projectId: string;
  keys: KeyStore;
  now?: () => number;
  /** 時計のずれの許容（秒） */
  clockSkewSeconds?: number;
}

export interface VerifiedIdToken {
  /** Firebase の uid（= sub） */
  uid: string;
  /** Google アカウントの ID。旧ユーザー（authentications.uid）との紐付けに使う */
  googleSub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  /** ログインした時刻（UNIX 秒） */
  authTime: number;
}

export type IdTokenErrorCode =
  | "malformed"
  | "unsupported_alg"
  | "unknown_kid"
  | "bad_signature"
  | "expired"
  | "claim_invalid"
  | "not_google";

export class IdTokenError extends Error {
  constructor(
    readonly code: IdTokenErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "IdTokenError";
  }
}

interface FirebaseClaims extends JWTPayload {
  auth_time?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  firebase?: {
    sign_in_provider?: unknown;
    identities?: Record<string, unknown>;
  };
}

export async function verifyIdToken(token: string, options: VerifyOptions): Promise<VerifiedIdToken> {
  const now = options.now ?? Date.now;
  const skew = options.clockSkewSeconds ?? 60;
  const nowSec = Math.floor(now() / 1000);

  let header;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    throw new IdTokenError("malformed", "JWT として読めない");
  }
  if (header.alg !== "RS256") throw new IdTokenError("unsupported_alg", `alg が RS256 でない: ${String(header.alg)}`);
  if (typeof header.kid !== "string" || header.kid === "") throw new IdTokenError("malformed", "kid が無い");

  const key = await options.keys.get(header.kid);
  if (!key) throw new IdTokenError("unknown_kid", "kid に対応する公開鍵が無い");

  let payload: FirebaseClaims;
  try {
    ({ payload } = await jwtVerify<FirebaseClaims>(token, key, {
      algorithms: ["RS256"],
      audience: options.projectId,
      issuer: `https://securetoken.google.com/${options.projectId}`,
      requiredClaims: ["exp", "iat", "sub", "auth_time"],
      currentDate: new Date(now()),
      clockTolerance: skew,
    }));
  } catch (e) {
    if (e instanceof errors.JWTExpired) throw new IdTokenError("expired", "期限切れ");
    if (e instanceof errors.JWSSignatureVerificationFailed) throw new IdTokenError("bad_signature", "署名が正しくない");
    if (e instanceof errors.JWTClaimValidationFailed) throw new IdTokenError("claim_invalid", e.message);
    throw new IdTokenError("malformed", e instanceof Error ? e.message : String(e));
  }

  // jose は iat が未来でも通すので、自分で確かめる
  if (typeof payload.iat !== "number" || payload.iat > nowSec + skew) {
    throw new IdTokenError("claim_invalid", "iat が未来");
  }
  if (typeof payload.auth_time !== "number" || payload.auth_time > nowSec + skew) {
    throw new IdTokenError("claim_invalid", "auth_time が未来、または数値でない");
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 128) {
    throw new IdTokenError("claim_invalid", "sub が空、または長すぎる");
  }

  // Google ログインだけを受け付ける（匿名・メールリンクなどは使わない）
  if (payload.firebase?.sign_in_provider !== "google.com") {
    throw new IdTokenError("not_google", "Google ログインではない");
  }
  const googleIds = payload.firebase.identities?.["google.com"];
  const googleSub = Array.isArray(googleIds) ? googleIds[0] : undefined;
  if (typeof googleSub !== "string" || !/^[0-9]{1,64}$/.test(googleSub)) {
    throw new IdTokenError("not_google", "Google アカウントの ID が無い");
  }

  return {
    uid: payload.sub,
    googleSub,
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : null,
    authTime: payload.auth_time,
  };
}
