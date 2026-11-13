import type { PrismaClient } from "../generated/prisma/client";

/** 現行の「タグ AND 絞り込み」（選んだタグをすべて持つ店）＋店名の部分一致 */
export function searchIzakayas(prisma: PrismaClient, opts: { tagIds?: number[]; name?: string }) {
  const tagIds = opts.tagIds ?? [];
  return prisma.izakaya.findMany({
    where: {
      hidden: false,
      ...(opts.name ? { name: { contains: opts.name } } : {}),
      AND: tagIds.map((tagId) => ({ tags: { some: { tagId } } })),
    },
    include: { tags: { include: { tag: true }, orderBy: { tag: { sortOrder: "asc" } } } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

/**
 * 旅程表の中の店を newIndex の位置へ動かす（現行 ranked-model の row_order_position 相当）。
 * 位置の振り直しは D1 の batch() で1つのトランザクションとして実行する。
 */
export async function moveItem(db: D1Database, planId: number, itemId: number, newIndex: number) {
  const { results } = await db
    .prepare("SELECT id FROM izakaya_plans WHERE plan_id = ?1 ORDER BY position, id")
    .bind(planId)
    .all<{ id: number }>();
  const ids = results.map((r) => r.id);
  const from = ids.indexOf(itemId);
  if (from === -1) throw new Error("item not in plan");
  ids.splice(from, 1);
  ids.splice(Math.max(0, Math.min(newIndex, ids.length)), 0, itemId);
  await db.batch(
    ids.map((id, i) =>
      db
        .prepare("UPDATE izakaya_plans SET position = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2 AND plan_id = ?3")
        .bind(i, id, planId),
    ),
  );
  return ids;
}
