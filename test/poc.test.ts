import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getPrisma } from "../app/lib/db.server";
import { moveItem, searchIzakayas } from "../app/lib/izakaya.server";

const db = env.DB;

async function seed() {
  const now = "2026-11-14 00:00:00";
  await db.batch(
    ["sessions", "favorites", "izakaya_plans", "plans", "users", "izakaya_tags", "izakayas", "tags"].map((t) =>
      db.prepare(`DELETE FROM ${t}`),
    ),
  );
  await db.batch([
    db.prepare("INSERT INTO tags (id, name, sort_order) VALUES (1,'立ち飲み',1),(2,'朝から',2),(3,'ホルモン',3)"),
    db.prepare(
      `INSERT INTO izakayas (id, name, sort_order, updated_at) VALUES
       (10,'店A',1,?1),(11,'店B',2,?1),(12,'Bar ABC',3,?1),(13,'店D（非表示）',4,?1)`,
    ).bind(now),
    db.prepare("UPDATE izakayas SET hidden = 1 WHERE id = 13"),
    db.prepare("INSERT INTO izakaya_tags (izakaya_id, tag_id) VALUES (10,1),(10,2),(11,1),(12,2),(13,1),(13,2)"),
    db.prepare("INSERT INTO users (id, name, updated_at) VALUES (1,'nao',?1)").bind(now),
    db.prepare("INSERT INTO plans (id, user_id, name, updated_at) VALUES (100,1,'はしご酒',?1)").bind(now),
    db.prepare(
      "INSERT INTO izakaya_plans (id, plan_id, izakaya_id, position, updated_at) VALUES (1000,100,10,0,?1),(1001,100,11,1,?1),(1002,100,12,2,?1)",
    ).bind(now),
  ]);
}

describe("PoC b: Prisma 7.10 + D1", () => {
  beforeEach(seed);

  it("タグの AND 絞り込み（選んだタグをすべて持つ店だけ。非表示の店は除く）", async () => {
    const prisma = getPrisma(db);
    const both = await searchIzakayas(prisma, { tagIds: [1, 2] });
    expect(both.map((i) => i.id)).toEqual([10]);
    const one = await searchIzakayas(prisma, { tagIds: [1] });
    expect(one.map((i) => i.id)).toEqual([10, 11]);
    const none = await searchIzakayas(prisma, {});
    expect(none.map((i) => i.id)).toEqual([10, 11, 12]);
    expect(both[0].tags.map((t) => t.tag.name)).toEqual(["立ち飲み", "朝から"]);
  });

  it("店名の部分一致: 英字の大文字・小文字は区別しない（現行の ILIKE と同じ）。全角と半角は別扱い", async () => {
    const prisma = getPrisma(db);
    expect((await searchIzakayas(prisma, { name: "abc" })).map((i) => i.id)).toEqual([12]);
    expect((await searchIzakayas(prisma, { name: "ＡＢＣ" })).map((i) => i.id)).toEqual([]);
    expect((await searchIzakayas(prisma, { name: "店" })).map((i) => i.id)).toEqual([10, 11]);
  });
});

describe("PoC c: 原子性", () => {
  beforeEach(seed);

  it("D1 の batch() は途中で失敗すると全体が巻き戻る", async () => {
    await expect(
      db.batch([
        db.prepare("UPDATE izakaya_plans SET position = 99 WHERE id = 1000"),
        db.prepare("INSERT INTO no_such_table VALUES (1)"),
      ]),
    ).rejects.toThrow();
    const row = await db.prepare("SELECT position FROM izakaya_plans WHERE id = 1000").first<{ position: number }>();
    expect(row?.position).toBe(0);
  });

  it("Prisma の $transaction([...]) は失敗しても前の更新が残る（原子性が無い）", async () => {
    const prisma = getPrisma(db);
    await expect(
      prisma.$transaction([
        prisma.tag.update({ where: { id: 1 }, data: { name: "書き換え" } }),
        prisma.tag.create({ data: { id: 1, name: "重複ID" } }),
      ]),
    ).rejects.toThrow();
    const tag = await prisma.tag.findUnique({ where: { id: 1 } });
    expect(tag?.name).toBe("書き換え"); // ← 巻き戻っていない
  });

  it("並べ替え（ranked-model 相当）を batch() で一括更新できる", async () => {
    const order = await moveItem(db, 100, 1002, 0);
    expect(order).toEqual([1002, 1000, 1001]);
    const { results } = await db
      .prepare("SELECT id FROM izakaya_plans WHERE plan_id = 100 ORDER BY position")
      .all<{ id: number }>();
    expect(results.map((r) => r.id)).toEqual([1002, 1000, 1001]);
  });

  it("外部キーは D1 で強制される（子がある親は消せない）", async () => {
    await expect(db.prepare("DELETE FROM plans WHERE id = 100").run()).rejects.toThrow(/FOREIGN KEY/);
  });
});
