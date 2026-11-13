-- PoC: prisma migrate diff がこの環境で動かないため手書き（本番では CI で生成する）
CREATE TABLE "izakayas" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "place_id" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "lat" REAL,
  "lng" REAL,
  "coords_fetched_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "izakayas_place_id_key" ON "izakayas"("place_id");
CREATE TABLE "tags" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "izakaya_tags" (
  "izakaya_id" INTEGER NOT NULL,
  "tag_id" INTEGER NOT NULL,
  PRIMARY KEY ("izakaya_id", "tag_id"),
  CONSTRAINT "izakaya_tags_izakaya_id_fkey" FOREIGN KEY ("izakaya_id") REFERENCES "izakayas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "izakaya_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "izakaya_tags_tag_id_idx" ON "izakaya_tags"("tag_id");
CREATE TABLE "users" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "firebase_uid" TEXT,
  "google_sub" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");
CREATE TABLE "plans" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "name" TEXT,
  "public" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "plans_user_id_idx" ON "plans"("user_id");
CREATE TABLE "izakaya_plans" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "plan_id" INTEGER NOT NULL,
  "izakaya_id" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "izakaya_plans_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "izakaya_plans_izakaya_id_fkey" FOREIGN KEY ("izakaya_id") REFERENCES "izakayas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "izakaya_plans_plan_id_position_idx" ON "izakaya_plans"("plan_id", "position");
CREATE TABLE "favorites" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "izakaya_id" INTEGER NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "favorites_izakaya_id_fkey" FOREIGN KEY ("izakaya_id") REFERENCES "izakayas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "favorites_user_id_izakaya_id_key" ON "favorites"("user_id", "izakaya_id");
CREATE INDEX "favorites_izakaya_id_idx" ON "favorites"("izakaya_id");
