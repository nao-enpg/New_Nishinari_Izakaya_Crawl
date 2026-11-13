import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "../generated/prisma/client";

/** リクエストごとに作る。D1 アダプターではトランザクションが効かないので、原子性が必要なら db.batch() を使う */
export function getPrisma(db: D1Database) {
  return new PrismaClient({ adapter: new PrismaD1(db) });
}
