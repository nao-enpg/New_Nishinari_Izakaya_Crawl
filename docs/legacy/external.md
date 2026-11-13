# 外部サービス・SEO・静的ファイル

## 外部サービス

| サービス | 使い方 | 新しい実装 |
| --- | --- | --- |
| Google OAuth（sorcery） | ログイン | Firebase Authentication に置き換え（C-001） |
| Maps JavaScript API | 一覧の地図 | 継続。開いたときに読み込む、AdvancedMarker と Map ID（C-006） |
| Places API (Legacy) | 取り込みスクリプトで店の情報を取得（現在は使われていない） | Places API (New) に置き換え |
| Google Analytics 4 | `G-9MPR30BKGN` | 同じ ID を引き継ぐ。ページ遷移での page_view を確認 |
| Font Awesome Kit | ハートのアイコン | shadcn/ui 側のアイコン（lucide など）に置き換え可（要確認） |
| Google Fonts | BIZ UDPGothic | 継続（見た目の方針で決める） |
| jQuery 3.7.1 | 読み込むだけで未使用 | 移植しない |
| Google フォーム | 問い合わせの送信先 | 継続（送信先と項目 ID は screens.md） |
| X（Twitter） | 共有の投稿画面（intent/tweet） | 継続 |
| YouTube | 店名での検索リンク | 継続 |

## SEO

- `<title>` が2つ出る。meta description と keywords は空（D-022）。
- canonical と og:url は `?locale=` を含む元の URL。hreflang は無い。
- og:image は `ogp.png`、og:locale は `ja_JP` で固定。
- 旅程表の詳細だけ、og:title と og:url を上書きする。
- `robots.txt` はコメントだけ（全許可）。サイトマップは無い。

## 静的ファイル

| ファイル | 用途 | 移植 |
| --- | --- | --- |
| `top_small.jpg`（2.9MB） | トップと問い合わせの背景 | ○（軽くする） |
| `beer.jpg`、`cheers.jpg` | トップのカードの背景 | ○ |
| `ogp.png` | OGP 画像 | ○ |
| `favicon.ico`（アセット側） | ファビコン | ○（`public/favicon.ico` は0バイトなので、正しいものを配信する） |
| `x-logo.svg`、`web_dark_rd_na.svg` | X のロゴ、Google ログインのボタン画像 | ○ |
| `eyecatch.gif`（41.6MB） | README 用 | × |
| `top.jpg`（19.7MB） | 未使用 | × |
| apple-touch-icon（0バイト） | | 正しいものを用意する（要確認） |

## ホスティングとセキュリティヘッダー

- Koyeb で Docker イメージを動かしている。`config.hosts` は `nishinari-izakaya.net` だけ（`www` は不可）。
- `force_ssl` が有効で、HSTS は2年・サブドメイン込み。Rails 既定の X-Frame-Options SAMEORIGIN、X-Content-Type-Options nosniff、Referrer-Policy strict-origin-when-cross-origin が付く。新しい実装でも同じヘッダーを付ける。
