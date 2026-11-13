import { env } from "cloudflare:workers";
import { expect, it } from "vitest";

it("D1 バインディングが使える", async () => {
  const row = await env.DB.prepare("SELECT 1 AS one").first<{ one: number }>();
  expect(row?.one).toBe(1);
});
