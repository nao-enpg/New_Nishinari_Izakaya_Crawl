-- PoC d: 自前のセッション（prisma migrate diff がこの環境で動かないため手書き。本番では CI で生成する）
-- Cookie にはランダムなトークンを入れ、DB にはその SHA-256 だけを保存する（DB が漏れてもセッションを乗っ取れない）
CREATE TABLE "sessions" (
  "id_hash" TEXT NOT NULL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "created_at" INTEGER NOT NULL,
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
