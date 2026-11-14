/**
 * 自前のセッション（D1）。
 * - Cookie: __Host-session（Secure・HttpOnly・SameSite=Lax・Path=/。__Host- を付けるとサブドメインから上書きできない）
 * - DB には Cookie の値（32バイトの乱数）の SHA-256 だけを保存する
 * - 時刻は UNIX 秒の整数で持つ（比較を SQL の中で済ませるため）
 */

export const SESSION_COOKIE = "__Host-session";

export interface SessionUser {
  userId: number;
  name: string;
  expiresAt: number;
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function createSession(
  db: D1Database,
  userId: number,
  opts: { nowSec: number; ttlSeconds: number },
): Promise<{ token: string; setCookie: string }> {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  await db
    .prepare("INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(await hashToken(token), userId, opts.nowSec + opts.ttlSeconds, opts.nowSec)
    .run();
  return { token, setCookie: sessionCookie(token, opts.ttlSeconds) };
}

export async function getSessionUser(db: D1Database, request: Request, nowSec: number): Promise<SessionUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await db
    .prepare(
      `SELECT s.user_id AS userId, u.name AS name, s.expires_at AS expiresAt
       FROM sessions AS s JOIN users AS u ON u.id = s.user_id
       WHERE s.id_hash = ?1 AND s.expires_at > ?2`,
    )
    .bind(await hashToken(token), nowSec)
    .first<SessionUser>();
  return row ?? null;
}

export async function destroySession(db: D1Database, request: Request): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;
  await db.prepare("DELETE FROM sessions WHERE id_hash = ?1").bind(await hashToken(token)).run();
}
