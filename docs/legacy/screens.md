# 画面一覧

文言は `source/locales/` のキーで示す（例: `header.login`＝「Googleログイン」/「Google Login」）。
直書きの文言はそのまま「」で示す。

## S00 共通レイアウト（`layouts/application.html.erb`）

- `<title>`: `layouts.application.title`（西成泥酔旅行 / Nishinari Izakaya Crawl）。meta-tags の title も別に出力される（「西成泥酔旅行 | 西成泥酔旅行」で2つになる → D-022）。
- OGP と Twitter カード（`application_helper.rb`）
  - site と title は「西成泥酔旅行」。description は空。
  - type は website、url と canonical は `request.original_url`（`?locale=` を含む）。
  - image は `ogp.png`。locale は `ja_JP` で固定。
  - Twitter カードは `summary_large_image`。
- 読み込むもの: Font Awesome Kit、Google Fonts（BIZ UDPGothic）、jQuery 3.7.1（未使用）、GA4（`G-9MPR30BKGN`）。
- 本文のフォントは BIZ UDPGothic。
- **ヘッダー**（画面上部に固定、白文字。未ログインは `shared/_before_login_header.erb`、ログイン済みは `shared/_header.html.erb`）
  - 未ログイン: サイト名（`header.title`、`/` へのリンク。言語の指定が消える → D-008）、`JP` / `EN` の切り替え、`header.login`（Google のロゴつき。`/oauth/google` へ）。
  - ログイン済み: サイト名、`JP` / `EN`、`header.mypage`（`/profile`）/ `header.logout`（`DELETE /logout`）。
- **フラッシュ**（`shared/_flash_message.html.erb`）: ヘッダーの下に `pt-16` の余白をとって表示。種類は success / danger / notice / alert。
- **フッター**: トップページにだけある（要確認）。

## S01 トップ（`/`）

- 背景は `top_small.jpg` で画面いっぱい。
- 見出し「Welcome to DEEP OSAKA」（言語によらず英語）。
- `static_pages.top.description` を半透明の帯に表示。
- カード2枚
  - `static_pages.top.izakaya` ＋ `izakaya_description`（背景 `beer.jpg`、`/izakayas` へ）。aria-label は「呑みに行く」の直書き。
  - `static_pages.top.plan` ＋ `plan_description`（背景 `cheers.jpg`、`/plans` へ）。aria-label は「呑み計画を立てる」の直書き。
- フッター: `footer.contact`、`footer.terms_of_use`、`footer.privacy_policy`、X での共有（本文は `footer.tag` ＋ `https://nishinari-izakaya.net`）、`footer.title`（©）。

## S02 居酒屋一覧（`/izakayas`）

- ボタン `izakayas.index.search_by_name`: 押すと店名検索のフォームを開き、文言が `hide_search_by_name` に変わる。
  - フォーム: 入力欄（`q[name_cont]`）、`search` ボタン、`clear_search`（`/izakayas` へのリンク）。
- ボタン `search_by_tags`: 押すとタグの一覧を開き、文言が `hide_search_by_tags` に変わる。
  - 全タグを ID 順に丸いボタンで並べる。選択中は緑、それ以外は灰色。押すとそのタグを足したり外したりした URL に移動する。
  - **ページを移動すると、タグの一覧は閉じた状態に戻る**（要確認）。
- タグを1つ以上選んでいるときだけ `clear_narrow_down`（`/izakayas` へ）を表示する。
- ボタン `show_map`: 地図（高さ 500px）を開き、文言が `hide_map` に変わる。→ [behaviors.md](behaviors.md#地図)
- ボタン `search_nearby`: 現在地から近い10件を表示する。→ [behaviors.md](behaviors.md#現在地から近い10件)
- 店のカード（1〜3列）
  - 店名（詳細へのリンク）
  - 写真（`izakayas.image` の URL。詳細へのリンク）
  - タグ（ID 順）
  - ログイン済みで、自分の旅程表が1つ以上あるとき: 旅程表を選ぶプルダウン（`select_plan` が初期表示）と `add_izakaya` ボタン → `POST /izakaya_plans`
  - ログイン済みのとき: お気に入りのハート（白抜き＝未登録、塗り＝登録済み）
- フッターはない。

## S03 居酒屋詳細（`/izakayas/:id`）

- 店名、写真、タグ（ID 順）
- ボタン3つ（いずれも新しいタブ）
  - `izakayas.show.google_map`: `izakayas.url`（手で登録した Google マップの URL）
  - `direction_search`: `https://www.google.com/maps/dir/?api=1&destination=<緯度>,<経度>`
  - `youtube_search`: `https://www.youtube.com/results?search_query=西成 <店名>`
- 紹介文（`izakayas.description`）
- お気に入りと旅程表への追加は、この画面には無い。
- 存在しない ID は 404（Rails 既定の英語の静的ページ）。

## S04 旅程表一覧（`/plans`）

- ログイン済み: `plans.index.create_plan`（`/plans/new`）。未ログイン: `create_plan_login`（`/oauth/google`）。
- カード（幅 384px）: 1件目の店の写真（`plan.izakayas.first`。並べ替えた順ではない → D-016）、旅程表名、`show` ボタン。
- 本人の旅程表には `edit` と `delete` を表示。削除は確認ダイアログ（`confirm_delete`。英語の訳が無い → D-005）。
- 表示されるのは、公開中の旅程表と自分の旅程表。

## S05 旅程表の作成（`/plans/new`）・編集（`/plans/:id/edit`）

- 項目: 旅程タイトル（`plan[name]`）、他の人に公開する（チェックボックス）、旅程の説明（作成は1行の入力欄、編集は4行の入力欄）。
- ボタン: 作成は `plans.new.submit`、編集は `plans.edit.submit`。戻るリンク（`/plans`）。
- 入力チェックは無い（空の名前でも作れる → D-015）。

## S06 旅程表詳細（`/plans/:id`）

- 見出しに旅程表名、その下に説明。
- 本人のときだけ表示するもの
  - `plans.show.public`: `public_true` / `public_false`
  - 公開中なら `x_share`: X の投稿画面を開く。本文は「<旅程表名> <x_message> <旅程表の URL>」。
  - `add_izakaya`（`/izakayas` へ）
  - 並べ替えの説明 `plans.show.description`
- 店のカード（並べ替えた順）: 背景に店の写真、店名、`show`（店の詳細へ）。本人のときは `delete`（確認ダイアログあり）。
- 本人のときはドラッグ＆ドロップで並べ替えられる。→ [behaviors.md](behaviors.md#並べ替え)
- meta: title は「西成泥酔旅行」、og:title と og:url を上書きする。
- 非公開で本人以外 → `/plans` へ転送し、訳の無いメッセージを表示（D-004）。

## S07 マイページ（`/profile`）

- 「プロフィール」見出し（`profiles.profile`）、名前、`profiles.edit_name` ボタン。→ [behaviors.md](behaviors.md#名前のその場編集)
- `profiles.show.favorite_izakaya`: お気に入りの店のカード（背景に写真、店名、詳細へのリンク）。並び順の指定なし（要確認）。
- `profiles.show.plan_list`: 自分の旅程表のカード（背景に1件目の店の写真。写真が無いと灰色で、相対 URL `izakaya` を読みに行く → D-017）。
- `profiles.show.back`（`/` へ）。

## S08 問い合わせ（`/contact`）

- 背景は `top_small.jpg`。見出しは `static_pages.contact.contact_form`。
- フォームは Google フォームの `formResponse` に直接 POST し、送信後は Google の画面に移る。
  - メールアドレス（ラベル `static_pages.contact.e-mail`）: `entry.1932653243`（必須、placeholder「example@mail.co.jp」）
  - 本文（ラベル `static_pages.contact.msg`）: `entry.1841024108`（必須）
  - 送信ボタン: `static_pages.contact.submit`
- ラベルの `for` が入力欄と対応していない（要確認・アクセシビリティ）。

## S09 利用規約（`/terms`）・S10 プライバシーポリシー（`/privacy_policy`）

- 日本語のみ。英語の画面でも日本語のまま。本文は `source/static_pages/` にある。
- 新しい構成に合わせて追記が必要（C-010）。

## S11 エラーページ

- 404 / 422 / 500 は Rails 既定の英語の静的ページ（`public/*.html`）。406 は本文なし。
