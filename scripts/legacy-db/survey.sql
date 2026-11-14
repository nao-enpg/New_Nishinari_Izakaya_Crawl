-- 旧 DB（Rails 版、Koyeb の PostgreSQL）の調査。工程計画 P1-4、docs/legacy/data.md の「P1 の旧 DB 調査で数えるもの」。
--
-- 守ること
-- - 読み取りだけ。全体を READ ONLY のトランザクションで囲み、最後に ROLLBACK する。
-- - 出力は件数・最大値・長さなどの集計だけにする。このリポジトリは public で、Actions のログは誰でも読める。
--   メールアドレス・名前・uid・旅程表名・紹介文など、行の値そのものを SELECT しない。
-- - 対象のスキーマは Rails の db/schema.rb（版 2024_09_26_172151、docs/legacy/source/COMMIT のコミット）。
--   1節で、実際の DB がこのスキーマと一致しているかを確かめる。
--
-- 実行: scripts/legacy-db/survey.sh（LEGACY_DATABASE_URL を設定して実行する）

\set ON_ERROR_STOP 1
\encoding UTF8
\pset footer off
\pset null '(null)'

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

\echo
\echo '## 0. 接続先の環境'
SELECT current_setting('server_version') AS server_version,
       current_setting('server_encoding') AS server_encoding,
       pg_size_pretty(pg_database_size(current_database())) AS database_size;

-- lc_collate / lc_ctype の設定値は PostgreSQL 16 で廃止されたので、pg_database から読む。
-- 版によって列名が違う（daticulocale → datlocale）ので、JSON にしてから必要な列だけを出す。
SELECT key, value
FROM pg_database AS d, jsonb_each_text(to_jsonb(d)) AS j(key, value)
WHERE d.datname = current_database()
  AND key IN ('datcollate', 'datctype', 'datlocprovider', 'daticulocale', 'datlocale', 'daticurules', 'datcollversion')
ORDER BY key;

\echo
\echo '## 0b. 全角英字・半角カナの大文字小文字（Q-009。現行の店名検索は ransack の ILIKE）'
-- 文字列の定数は DB の既定の照合順序で比べられるので、ロケールの推測ではなく、実際の動きをそのまま確かめる。
SELECT 'BEER' ILIKE '%beer%'         AS ascii_ilike,
       'ＢＥＥＲ' ILIKE '%ｂｅｅｒ%' AS fullwidth_ilike,
       lower('ＢＥＥＲ') = 'ｂｅｅｒ' AS fullwidth_lower,
       'ビール' ILIKE '%ﾋﾞｰﾙ%'       AS kana_width_ilike;

\echo
\echo '## 1. テーブルと列（db/schema.rb との一致の確認）'
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = current_schema()
ORDER BY table_name, ordinal_position;

SELECT max(version) AS latest_migration, count(*) AS migrations
FROM schema_migrations;

\echo
\echo '## 2. 件数・番号の範囲・シーケンス・最終更新日（新しい番号は旧番号の続きから振る。P2-4）'
WITH t AS (
            SELECT 'authentications' AS table_name, count(*) AS row_count, min(id) AS min_id, max(id) AS max_id,
                   max(created_at)::date AS last_created, max(updated_at)::date AS last_updated FROM authentications
  UNION ALL SELECT 'favorites',       count(*), min(id), max(id), max(created_at)::date, max(updated_at)::date FROM favorites
  UNION ALL SELECT 'izakaya_plans',   count(*), min(id), max(id), max(created_at)::date, max(updated_at)::date FROM izakaya_plans
  UNION ALL SELECT 'izakaya_tags',    count(*), min(id), max(id), max(created_at)::date, max(updated_at)::date FROM izakaya_tags
  UNION ALL SELECT 'izakayas',        count(*), min(id), max(id), max(created_at)::date, max(updated_at)::date FROM izakayas
  UNION ALL SELECT 'plans',           count(*), min(id), max(id), max(created_at)::date, max(updated_at)::date FROM plans
  UNION ALL SELECT 'tags',            count(*), min(id), max(id), max(created_at)::date, max(updated_at)::date FROM tags
  UNION ALL SELECT 'users',           count(*), min(id), max(id), max(created_at)::date, max(updated_at)::date FROM users
)
SELECT t.*, s.last_value AS seq_last_value
FROM t
LEFT JOIN pg_sequences AS s
  ON format('%I.%I', s.schemaname, s.sequencename) = pg_get_serial_sequence(t.table_name, 'id')
ORDER BY t.table_name;

\echo
\echo '## 3. ユーザーと Google アカウントの紐付け（F3。旧ユーザーは Google アカウントの ID で紐付ける）'
SELECT count(*) AS users,
       count(*) FILTER (WHERE u.crypted_password IS NOT NULL) AS with_password,
       count(*) FILTER (WHERE NOT has_auth) AS without_authentication,
       count(*) FILTER (WHERE u.crypted_password IS NOT NULL AND NOT has_auth) AS password_only,
       count(*) FILTER (WHERE NOT has_auth AND (has_plan OR has_favorite)) AS without_authentication_with_data,
       count(*) FILTER (WHERE auth_count > 1) AS with_multiple_authentications,
       count(*) FILTER (WHERE has_plan) AS with_plans,
       count(*) FILTER (WHERE has_favorite) AS with_favorites,
       count(*) FILTER (WHERE btrim(u.name) = '') AS blank_name,
       max(char_length(u.name)) AS max_name_length
FROM users AS u
CROSS JOIN LATERAL (
  SELECT (SELECT count(*) FROM authentications AS a WHERE a.user_id = u.id) AS auth_count,
         EXISTS (SELECT 1 FROM authentications AS a WHERE a.user_id = u.id) AS has_auth,
         EXISTS (SELECT 1 FROM plans AS p WHERE p.user_id = u.id) AS has_plan,
         EXISTS (SELECT 1 FROM favorites AS f WHERE f.user_id = u.id) AS has_favorite
) AS x;

\echo '### 3b. uid の形式（Google アカウントの ID は数字だけで、通常は21桁）'
SELECT a.provider,
       count(*) AS row_count,
       count(*) FILTER (WHERE a.uid ~ '^[0-9]+$') AS numeric_uid,
       count(*) FILTER (WHERE a.uid ~ '^[0-9]{21}$') AS numeric_21_digits,
       min(char_length(a.uid)) AS min_uid_length,
       max(char_length(a.uid)) AS max_uid_length,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM users AS u WHERE u.id = a.user_id)) AS orphan_user_id
FROM authentications AS a
GROUP BY a.provider
ORDER BY a.provider;

\echo '### 3c. (provider, uid) の重複（一意制約が無い）'
SELECT count(*) AS duplicated_pairs,
       coalesce(sum(n - 1), 0) AS extra_rows,
       count(*) FILTER (WHERE user_count > 1) AS pairs_with_different_users
FROM (
  SELECT count(*) AS n, count(DISTINCT user_id) AS user_count
  FROM authentications
  GROUP BY provider, uid
  HAVING count(*) > 1
) AS d;

\echo
\echo '## 4. 居酒屋（P2 の突き合わせ）'
SELECT count(*) AS izakayas,
       count(*) FILTER (WHERE name IS NULL OR btrim(name) = '') AS blank_name,
       count(*) FILTER (WHERE name <> btrim(name)) AS name_with_outer_spaces,
       count(*) FILTER (WHERE description IS NULL OR btrim(description) = '') AS blank_description,
       count(*) FILTER (WHERE url IS NULL OR btrim(url) = '') AS blank_url,
       count(*) FILTER (WHERE lat IS NULL OR lng IS NULL) AS without_coordinates,
       count(*) FILTER (WHERE image IS NULL OR btrim(image) = '') AS without_image,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM izakaya_tags AS it WHERE it.izakaya_id = i.id)) AS without_tags,
       max(char_length(name)) AS max_name_length,
       max(char_length(description)) AS max_description_length
FROM izakayas AS i;

\echo '### 4b. 同じ店名（前後の空白を除き、英字の大文字小文字を区別しない）'
SELECT count(*) AS duplicated_names, coalesce(sum(n - 1), 0) AS extra_rows
FROM (
  SELECT count(*) AS n FROM izakayas WHERE name IS NOT NULL GROUP BY lower(btrim(name)) HAVING count(*) > 1
) AS d;

\echo '### 4c. 「Google Mapで見る」の URL の形（C-004、CID での照合）'
SELECT CASE
         WHEN url IS NULL OR btrim(url) = '' THEN '(なし)'
         WHEN url ~* '^https?://maps\.app\.goo\.gl/' THEN 'maps.app.goo.gl'
         WHEN url ~* '^https?://goo\.gl/maps/' THEN 'goo.gl/maps'
         WHEN url ~* '^https?://((www|maps)\.)?google\.[a-z.]+/' THEN 'google.*'
         ELSE 'その他'
       END AS url_host,
       url ~* '([?&]cid=[0-9]+|0x[0-9a-f]+:0x[0-9a-f]+)' AS has_cid,
       url ~* '(query_place_id|destination_place_id|place_id)[=:]' AS has_place_id,
       count(*) AS row_count
FROM izakayas
GROUP BY 1, 2, 3
ORDER BY row_count DESC, 1;

\echo
\echo '## 5. タグ'
SELECT (SELECT count(*) FROM tags) AS tags,
       (SELECT count(*) FROM (SELECT 1 FROM tags GROUP BY lower(btrim(name)) HAVING count(*) > 1) AS d) AS duplicated_tag_names,
       (SELECT count(*) FROM izakaya_tags) AS izakaya_tags,
       (SELECT count(*) FROM (SELECT 1 FROM izakaya_tags GROUP BY izakaya_id, tag_id HAVING count(*) > 1) AS d) AS duplicated_pairs,
       (SELECT coalesce(sum(n - 1), 0)
          FROM (SELECT count(*) AS n FROM izakaya_tags GROUP BY izakaya_id, tag_id HAVING count(*) > 1) AS d) AS extra_rows,
       (SELECT max(n) FROM (SELECT count(*) AS n FROM izakaya_tags GROUP BY izakaya_id) AS d) AS max_tags_per_izakaya;

\echo
\echo '## 6. 旅程表'
SELECT count(*) AS plans,
       count(*) FILTER (WHERE public IS TRUE) AS public_true,
       count(*) FILTER (WHERE public IS FALSE) AS public_false,
       count(*) FILTER (WHERE public IS NULL) AS public_null,
       count(*) FILTER (WHERE name IS NULL OR btrim(name) = '') AS blank_name,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM izakaya_plans AS ip WHERE ip.plan_id = p.id)) AS without_izakayas,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM users AS u WHERE u.id = p.user_id)) AS orphan_user,
       max(char_length(name)) AS max_name_length,
       max(char_length(description)) AS max_description_length
FROM plans AS p;

\echo '### 6b. 旅程表の店（row_order は 2024-09-12 15:57 UTC のマイグレーションで、値を埋めずに追加された）'
SELECT count(*) AS izakaya_plans,
       count(*) FILTER (WHERE row_order IS NULL) AS row_order_null,
       count(*) FILTER (WHERE row_order IS NULL AND created_at < '2024-09-12 15:57:24') AS null_created_before_migration,
       count(*) FILTER (WHERE row_order IS NULL AND created_at >= '2024-09-12 15:57:24') AS null_created_after_migration,
       min(row_order) AS min_row_order,
       max(row_order) AS max_row_order
FROM izakaya_plans;

SELECT count(*) AS plans_with_izakayas,
       count(*) FILTER (WHERE null_count > 0) AS plans_with_null_row_order,
       count(*) FILTER (WHERE null_count > 0 AND null_count < n) AS plans_mixing_null_and_value,
       max(n) AS max_izakayas_per_plan
FROM (
  SELECT count(*) AS n, count(*) FILTER (WHERE row_order IS NULL) AS null_count
  FROM izakaya_plans
  GROUP BY plan_id
) AS d;

\echo '### 6c. 並び順が同じ値の組（移行では id 順で振り直す）と、同じ店の重複（D-014）'
SELECT (SELECT count(*)
          FROM (SELECT 1 FROM izakaya_plans WHERE row_order IS NOT NULL
                GROUP BY plan_id, row_order HAVING count(*) > 1) AS d) AS tied_row_order_groups,
       (SELECT count(*)
          FROM (SELECT 1 FROM izakaya_plans GROUP BY plan_id, izakaya_id HAVING count(*) > 1) AS d) AS same_izakaya_groups,
       (SELECT coalesce(sum(n - 1), 0)
          FROM (SELECT count(*) AS n FROM izakaya_plans GROUP BY plan_id, izakaya_id HAVING count(*) > 1) AS d) AS same_izakaya_extra_rows;

\echo
\echo '## 7. お気に入り（一意制約が無い。移行で1件にまとめる）'
SELECT count(*) AS favorites,
       (SELECT count(*) FROM (SELECT 1 FROM favorites GROUP BY user_id, izakaya_id HAVING count(*) > 1) AS d) AS duplicated_pairs,
       (SELECT coalesce(sum(n - 1), 0)
          FROM (SELECT count(*) AS n FROM favorites GROUP BY user_id, izakaya_id HAVING count(*) > 1) AS d) AS extra_rows,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM users AS u WHERE u.id = f.user_id)) AS orphan_user,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM izakayas AS i WHERE i.id = f.izakaya_id)) AS orphan_izakaya
FROM favorites AS f;

ROLLBACK;
