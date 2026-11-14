import type { VerifiedIdToken } from "./verify-id-token.server";

export type LinkResult =
  | { kind: "existing"; userId: number }
  | { kind: "linked_legacy"; userId: number }
  | { kind: "created"; userId: number };

/**
 * Firebase の uid から、このサイトのユーザーを決める。
 * 1. firebase_uid が一致するユーザー → そのユーザー
 * 2. まだ紐付いていない旧ユーザーで、google_sub（旧 authentications.uid）が一致 → firebase_uid を書き込んで紐付ける
 * 3. どちらも無い → 新しく作る
 *
 * 各手順は1本の SQL で、条件つきの UPDATE と ON CONFLICT で同時ログインの競合に耐える。
 */
export async function findOrLinkUser(db: D1Database, token: VerifiedIdToken, nowIso: string): Promise<LinkResult> {
  const byUid = () =>
    db.prepare("SELECT id FROM users WHERE firebase_uid = ?1").bind(token.uid).first<{ id: number }>();

  const existing = await byUid();
  if (existing) return { kind: "existing", userId: existing.id };

  const linked = await db
    .prepare(
      `UPDATE users SET firebase_uid = ?1, updated_at = ?3
       WHERE google_sub = ?2 AND firebase_uid IS NULL
       RETURNING id`,
    )
    .bind(token.uid, token.googleSub, nowIso)
    .first<{ id: number }>();
  if (linked) return { kind: "linked_legacy", userId: linked.id };

  const created = await db
    .prepare(
      `INSERT INTO users (name, firebase_uid, google_sub, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
    )
    // 新規ユーザーの名前は Google の表示名（無ければ仮の名前）。扱いは F3 の clarify で決める
    .bind(token.name ?? "ユーザー", token.uid, token.googleSub, nowIso)
    .first<{ id: number }>();
  if (created) return { kind: "created", userId: created.id };

  // 同時に別のリクエストが作った・紐付けた場合
  const raced = await byUid();
  if (raced) return { kind: "existing", userId: raced.id };

  // google_sub は一致するが、別の firebase_uid に紐付いている（同じ Google アカウントで別の Firebase プロジェクトなど）
  throw new Error("google_sub が別の firebase_uid に紐付いている");
}
