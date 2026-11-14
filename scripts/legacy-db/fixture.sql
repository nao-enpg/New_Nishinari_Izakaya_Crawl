-- survey.sql の確認用の合成データ。実データは含まない。
-- スキーマは Rails の db/schema.rb（版 2024_09_26_172151）を PostgreSQL の DDL に書き直したもの。
-- 調べたい異常（重複・NULL・孤立・パスワードだけのユーザーなど）をわざと入れている。期待値は survey.expected.txt。

CREATE TABLE schema_migrations (version varchar PRIMARY KEY);
INSERT INTO schema_migrations VALUES
  ('20240516152109'), ('20240528162848'), ('20240602094538'), ('20240602095357'), ('20240610143240'),
  ('20240613131738'), ('20240613133857'), ('20240614171524'), ('20240616125907'), ('20240617102514'),
  ('20240617102525'), ('20240618075029'), ('20240912155724'), ('20240926172151');

CREATE TABLE users (
  id bigserial PRIMARY KEY,
  name varchar NOT NULL,
  email varchar NOT NULL,
  crypted_password varchar,
  salt varchar,
  created_at timestamp(6) NOT NULL,
  updated_at timestamp(6) NOT NULL
);
CREATE UNIQUE INDEX index_users_on_email ON users (email);

-- user_id は integer で、外部キーが無い（schema.rb のとおり）
CREATE TABLE authentications (
  id bigserial PRIMARY KEY,
  user_id integer NOT NULL,
  provider varchar NOT NULL,
  uid varchar NOT NULL,
  created_at timestamp(6) NOT NULL,
  updated_at timestamp(6) NOT NULL
);

CREATE TABLE izakayas (
  id bigserial PRIMARY KEY,
  name varchar,
  formatted_address varchar,
  lat double precision,
  lng double precision,
  photo_reference varchar,
  image varchar,
  opening_hours varchar,
  description varchar,
  created_at timestamp(6) NOT NULL,
  updated_at timestamp(6) NOT NULL,
  url text
);

CREATE TABLE tags (
  id bigserial PRIMARY KEY,
  name varchar NOT NULL,
  created_at timestamp(6) NOT NULL,
  updated_at timestamp(6) NOT NULL
);

CREATE TABLE izakaya_tags (
  id bigserial PRIMARY KEY,
  izakaya_id bigint NOT NULL REFERENCES izakayas,
  tag_id bigint NOT NULL REFERENCES tags,
  created_at timestamp(6) NOT NULL,
  updated_at timestamp(6) NOT NULL
);

CREATE TABLE plans (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users,
  name varchar,
  public boolean,
  created_at timestamp(6) NOT NULL,
  updated_at timestamp(6) NOT NULL,
  description text
);

CREATE TABLE izakaya_plans (
  id bigserial PRIMARY KEY,
  plan_id bigint NOT NULL REFERENCES plans,
  izakaya_id bigint NOT NULL REFERENCES izakayas,
  created_at timestamp(6) NOT NULL,
  updated_at timestamp(6) NOT NULL,
  row_order integer
);

CREATE TABLE favorites (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users,
  izakaya_id bigint NOT NULL REFERENCES izakayas,
  created_at timestamp(6) NOT NULL,
  updated_at timestamp(6) NOT NULL
);

-- ユーザー: 1 = Google、2 = Google の uid が2つ、3 = パスワードだけ（旅程表あり）、4 = 認証なし・名前が空白、5 = パスワードと Google の両方
INSERT INTO users (id, name, email, crypted_password, salt, created_at, updated_at) VALUES
  (1, 'user1', 'u1@example.com', NULL,   NULL,   '2024-06-10 10:00', '2024-06-10 10:00'),
  (2, 'user2', 'u2@example.com', NULL,   NULL,   '2024-07-01 10:00', '2024-07-01 10:00'),
  (3, 'user3', 'u3@example.com', 'hash', 'salt', '2024-07-02 10:00', '2024-07-02 10:00'),
  (4, ' ',     'u4@example.com', NULL,   NULL,   '2024-07-03 10:00', '2024-07-03 10:00'),
  (5, 'user5', 'u5@example.com', 'hash', 'salt', '2024-10-05 10:00', '2024-10-06 10:00');
SELECT setval('users_id_seq', 5);

-- uid: 21桁が3件、数字だけで7桁が1件、数字以外が1件。5行目は user_id 99（存在しない）で、1行目と同じ uid（重複・別ユーザー）
INSERT INTO authentications (id, user_id, provider, uid, created_at, updated_at) VALUES
  (1, 1,  'google', '123456789012345678901', '2024-06-10 10:00', '2024-06-10 10:00'),
  (2, 2,  'google', '109876543210987654321', '2024-07-01 10:00', '2024-07-01 10:00'),
  (3, 2,  'google', '1098765',               '2024-07-01 11:00', '2024-07-01 11:00'),
  (4, 5,  'google', 'abc-not-numeric',       '2024-10-05 10:00', '2024-10-05 10:00'),
  (5, 99, 'google', '123456789012345678901', '2024-10-07 10:00', '2024-10-07 10:00');
SELECT setval('authentications_id_seq', 5);

-- 居酒屋: 2 と 3 は前後に空白、1 と 3 は同じ店名（大文字小文字と空白を除くと一致）。シーケンスは削除済みの行の分だけ進んでいる
INSERT INTO izakayas (id, name, lat, lng, image, description, url, created_at, updated_at) VALUES
  (1, '大衆酒場 A',  34.65, 135.50, 'https://example.com/1.jpg', '紹介文', 'https://maps.app.goo.gl/abc',
   '2024-06-10 10:00', '2024-06-10 10:00'),
  (2, ' 立ち飲み B ', 34.64, 135.51, 'https://example.com/2.jpg', '紹介文',
   'https://www.google.com/maps/place/B/data=!4m2!3m1!1s0x6000e0b2:0x1234abcd', '2024-06-11 10:00', '2024-06-11 10:00'),
  (3, '大衆酒場 a ', NULL, NULL, NULL, '', NULL, '2024-06-12 10:00', '2024-06-12 10:00'),
  (4, 'Bar C', 34.66, 135.49, NULL, NULL, 'https://www.google.com/maps?cid=1234567890', '2024-06-13 10:00', '2024-09-01 10:00');
SELECT setval('izakayas_id_seq', 12);

INSERT INTO tags (id, name, created_at, updated_at) VALUES
  (1, '安い',   '2024-06-13 10:00', '2024-06-13 10:00'),
  (2, '朝から', '2024-06-13 10:00', '2024-06-13 10:00'),
  (3, '安い ',  '2024-06-14 10:00', '2024-06-14 10:00');
SELECT setval('tags_id_seq', 3);

-- (1, 1) が重複。3 にはタグが無い
INSERT INTO izakaya_tags (id, izakaya_id, tag_id, created_at, updated_at) VALUES
  (1, 1, 1, '2024-06-14 10:00', '2024-06-14 10:00'),
  (2, 1, 2, '2024-06-14 10:00', '2024-06-14 10:00'),
  (3, 1, 1, '2024-06-14 10:00', '2024-06-14 10:00'),
  (4, 2, 3, '2024-06-14 10:00', '2024-06-14 10:00'),
  (5, 4, 1, '2024-06-14 10:00', '2024-06-14 10:00');
SELECT setval('izakaya_tags_id_seq', 5);

-- 旅程表: 2 は名前が NULL・公開が NULL、3 は名前が空文字で店が無い
INSERT INTO plans (id, user_id, name, public, description, created_at, updated_at) VALUES
  (1, 1, '旅程A', true,  NULL,     '2024-06-20 10:00', '2024-09-21 10:00'),
  (2, 1, NULL,    NULL,  '説明',   '2024-08-01 10:00', '2024-10-01 10:00'),
  (3, 3, '',      false, NULL,     '2024-07-05 10:00', '2024-07-05 10:00');
SELECT setval('plans_id_seq', 3);

-- 旅程表 1: 4194304 が同じ値で2件。旅程表 2: マイグレーション前の NULL が2件（同じ店）と、値のある行が1件
INSERT INTO izakaya_plans (id, plan_id, izakaya_id, row_order, created_at, updated_at) VALUES
  (1, 1, 1, 0,       '2024-09-20 10:00', '2024-09-20 10:00'),
  (2, 1, 2, 4194304, '2024-09-20 10:00', '2024-09-20 10:00'),
  (3, 1, 4, 4194304, '2024-09-21 10:00', '2024-09-21 10:00'),
  (4, 2, 1, NULL,    '2024-08-01 10:00', '2024-08-01 10:00'),
  (5, 2, 1, NULL,    '2024-08-02 10:00', '2024-08-02 10:00'),
  (6, 2, 2, 100,     '2024-10-01 10:00', '2024-10-01 10:00');
SELECT setval('izakaya_plans_id_seq', 6);

-- (1, 1) が重複
INSERT INTO favorites (id, user_id, izakaya_id, created_at, updated_at) VALUES
  (1, 1, 1, '2024-06-21 10:00', '2024-06-21 10:00'),
  (2, 1, 1, '2024-06-21 10:00', '2024-06-21 10:00'),
  (3, 1, 2, '2024-06-22 10:00', '2024-06-22 10:00'),
  (4, 2, 4, '2024-07-01 12:00', '2024-07-01 12:00');
SELECT setval('favorites_id_seq', 4);
