# データ（現行 DB）と移行での扱い

現行は Koyeb の PostgreSQL（米国東部）。スキーマは `db/schema.rb`（版 2024-09-26）。
「Google」の列は Places API 由来のデータ。Google Maps Platform の規約により、**新しい DB には移さない**。

## izakayas（居酒屋）

| 列 | 型 | 現行での使われ方 | 移行 |
| --- | --- | --- | --- |
| id | bigint | URL（`/izakayas/:id`）、並び順 | **そのまま引き継ぐ** |
| name | string | 店名 | 引き継ぐ（Nao が確定した表記として。要確認） |
| formatted_address | string | 未表示（Google） | 移さない |
| lat / lng | float | 地図、近い10件、行き方リンク（Google） | 移さない。place_id から取り直し、30日ごとに更新 |
| photo_reference | string | 未表示（Google） | 移さない |
| image | string | 写真の URL（Google の写真のリダイレクト先） | 移さない。表示のたびに取得（C-003） |
| opening_hours | string | 未表示（Google） | 移さない |
| description | string | 紹介文（手入力） | 引き継ぐ |
| url | text | 「Google Mapで見る」のリンク（手入力） | 引き継ぐかは要確認（C-004） |
| created_at / updated_at | datetime | | 引き継ぐ |
| （新規）place_id | | | 突き合わせで付与 |
| （新規）sort_order / hidden | | | 表示順・非表示 |

## tags / izakaya_tags

- tags: id、name。表示順は ID 順 → 新しい DB では `sort_order` を持ち、旧 ID の順で埋める。
- izakaya_tags: izakaya_id、tag_id（重複を防ぐ制約が無い。移行時に重複を除く）。

## users / authentications

| 列 | 移行 |
| --- | --- |
| users.id | 引き継ぐ |
| users.name | 引き継ぐ |
| users.email | 一意制約あり。旧ユーザーとの紐付けの予備として一時的に持つか、要確認（F3） |
| users.crypted_password / salt | 移さない（使われていない） |
| authentications.provider / uid | uid（Google アカウントの ID の見込み）を `users.google_sub` として引き継ぐ。P1 で形式を確認。`(provider, uid)` に一意制約は無く、`user_id` は integer で外部キーも無い |

**P1 の旧 DB 調査で数えるもの**（R35 のメール/パスワードで作られたユーザーがいる可能性があるため）
- `crypted_password` が NULL でないユーザー
- `authentications` を持たないユーザー（Google と紐付けられないので、移行するか決める）
- `(provider, uid)` の重複、`authentications.user_id` の孤立

## plans / izakaya_plans / favorites

- plans: id（**URL で共有されているので引き継ぐ**）、user_id、name（NULL あり）、public（NULL を許し、既定値なし → 移行で NULL は false にする）、description、日時。
- izakaya_plans: plan_id、izakaya_id、row_order（ranked-model の離れた整数）→ 順番を保って 0, 1, 2… の `position` に振り直す。`row_order` は 2024-09-12 に値を埋めずに追加されたので、それより前の行は NULL の可能性がある（現行は NULL を最後に並べる）。移行では「NULL は最後、その中は id 順」とする。同じ店の重複はそのまま残すか要確認（D-014）。
- favorites: user_id、izakaya_id（DB に一意制約が無い）→ 重複を1件にまとめ、一意制約を付ける。

## 外部キー

- 現行: favorites → users / izakayas、izakaya_plans → plans / izakayas、izakaya_tags → izakayas / tags、plans → users。
- Rails 側で `dependent: :destroy` を付けているのは、users → favorites / authentications、plans → izakaya_plans、izakayas → favorites。
