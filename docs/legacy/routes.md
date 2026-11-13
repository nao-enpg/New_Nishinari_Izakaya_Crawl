# ルート一覧

- 生成されるすべての内部 URL に `?locale=<ja|en>` が付く（`ApplicationController#default_url_options`）。言語の扱いは [i18n.md](i18n.md)。
- ログインの要否は、`ApplicationController` の `before_action :require_login` と、各コントローラの `skip_before_action` で決まる。
- 未ログインで要ログインの URL を開くと `/login` に転送され、テンプレートが無いため **406・本文なしの空白ページ** になる（バグ → D-010）。
- 「移植」列: ○＝移植する、×＝移植しない、置換＝別の仕組みに置き換える。

## 画面・機能

| # | メソッド | パス | 処理 | ログイン | パラメータ | 応答 | 移植 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | GET | `/` | static_pages#top | 不要 | | HTML | ○ | トップ |
| R02 | GET | `/contact` | static_pages#contact | 不要 | | HTML | ○ | 問い合わせ（Google フォームへ POST） |
| R03 | GET | `/terms` | static_pages#terms | 不要 | | HTML | ○ | 利用規約（日本語のみ） |
| R04 | GET | `/privacy_policy` | static_pages#privacy_policy | 不要 | | HTML | ○ | プライバシーポリシー（日本語のみ） |
| R05 | GET | `/izakayas` | izakayas#index | 不要 | `q[name_cont]`、`q[tags_id_all][]`、`lat`、`lng` | HTML | ○ | 一覧・検索。詳細は下記 |
| R06 | GET | `/izakayas/:id` | izakayas#show | 不要 | | HTML / 404 | ○ | 詳細 |
| R07 | GET | `/izakayas/favorites` | izakayas#favorites | 不要（のはず） | | **500** | × | 存在しないメソッドを呼ぶので常に失敗（D-X02） |
| R08 | POST | `/favorites?izakaya_id=:id` | favorites#create | 必要 | `izakaya_id` | turbo-stream / HTML は `/izakayas` へ転送 | ○ | お気に入り登録。2回目はエラー（バグ → D-013） |
| R09 | DELETE | `/favorites/:id` | favorites#destroy | 必要 | | turbo-stream / HTML は 303 で `/izakayas` | ○ | 自分のお気に入りだけ消せる。見つからないと `alert: 'Favorite not found'`（英語の直書き） |
| R10 | GET | `/plans` | plans#index | 不要 | | HTML | ○ | 公開中の旅程表＋自分の旅程表。並び順の指定なし（要確認） |
| R11 | GET | `/plans/new` | plans#new | 必要 | | HTML | ○ | |
| R12 | POST | `/plans` | plans#create | 必要 | `plan[name]`、`plan[public]`、`plan[description]` | 詳細へ転送、notice「旅程表を作成しました」 | ○ | 入力チェックなし（要確認 → D-015） |
| R13 | GET | `/plans/:id` | plans#show | 不要 | | HTML | ○ | 非公開で本人以外 → `/plans` へ転送し、訳の無いメッセージを表示（バグ → D-004） |
| R14 | GET | `/plans/:id/edit` | plans#edit | 必要 | | HTML | ○ | **本人確認なし**（バグ → D-001） |
| R15 | PATCH/PUT | `/plans/:id` | plans#update | 必要 | 同上 | 詳細へ転送、notice「更新しました」 | ○ | **本人確認なし**（バグ → D-001） |
| R16 | DELETE | `/plans/:id` | plans#destroy | 必要 | | 303 で `/plans`、success「削除しました」 | ○ | **本人確認なし**（バグ → D-001）。中の店（izakaya_plans）も消える |
| R17 | POST | `/izakaya_plans` | izakaya_plans#create | 必要 | `izakaya_plan[izakaya_id]`、`izakaya_plan[plan_id]` | 旅程表の詳細へ転送、notice「旅程表に追加しました。」（日本語の直書き） | ○ | **他人の旅程表にも追加できる**（バグ → D-002）。同じ店を何度でも追加できる（要確認 → D-014）。失敗時は `/izakayas` へ、alert「追加に失敗しました。」 |
| R18 | DELETE | `/izakaya_plans/:id` | izakaya_plans#destroy | 必要 | | 303 で旅程表の詳細へ、notice「旅程表から削除しました。」 | ○ | **本人確認なし**（バグ → D-002） |
| R19 | PATCH | `/izakaya_plans/:id/reorder` | izakaya_plans#reorder | 必要 | JSON `{ row_order_position: 新しい位置 }` | 200（本文なし） | ○ | **本人確認なし**（バグ → D-002） |
| R20 | GET | `/profile` | profiles#show | 必要 | | HTML | ○ | マイページ |
| R21 | GET | `/profile/edit` | profiles#edit | 必要 | | Turbo Frame 内ならレイアウトなし | ○ | 名前のその場編集フォーム |
| R22 | PATCH/PUT | `/profile` | profiles#update | 必要 | `user[name]` | turbo-stream / HTML はマイページへ転送 | ○ | 名前が空なら 422 でフォームを再表示 |

## 認証

| # | メソッド | パス | 処理 | ログイン | 応答 | 移植 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R30 | GET | `/oauth/:provider`（google） | oauths#oauth | 不要 | Google へ転送 | 置換 | Firebase の Google ログインに置き換え（C-001） |
| R31 | GET/POST | `/oauth/callback?provider=google` | oauths#callback | 不要 | `/` へ転送、success「Googleアカウントでログインしました」／失敗時 danger | 置換 | 初回はユーザーを作成（名前とメールを Google から取得）。ログイン後は常にトップへ |
| R32 | DELETE | `/logout` | user_sessions#destroy | 不要 | 303 で `/`、success「ログアウトしました」 | ○ | ヘッダーのログアウト |
| R33 | GET | `/login` | user_sessions#new | 不要 | **406・空白** | 置換 | 要ログイン時の転送先だがテンプレートが無い（D-010） |
| R34 | POST | `/login` | user_sessions#create | 不要 | | × | メール/パスワード認証。画面が無く使われていない |
| R35 | GET/POST | `/users/new`、`/users` | users#new / create | 不要 | 406 | × | 同上 |
| R36 | GET/POST/DELETE | `/sessions/...` | sessions#* | 必要 | | × | 同上 |
| R37 | GET | `/up` | rails/health#show | 不要 | 200 | × | Koyeb のヘルスチェック用 |

## `/izakayas` の検索仕様

- **店名検索**: `q[name_cont]` の部分一致（Postgres の ILIKE。英字の大文字・小文字は区別しない）。
- **タグ絞り込み**: `q[tags_id_all][]` に入ったタグを**すべて**持つ店（AND）。タグのリンクを押すたびに、そのタグを足したり外したりした URL へ移動する。
- 店名検索とタグ絞り込みは**同時に使えない**。それぞれのフォームやリンクが、もう一方の条件を引き継がない（要確認）。
- **近い10件**: `lat` と `lng` があると、店名とタグの条件を無視して、全店から現在地までの距離を計算し、近い順に10件を返す（地球の半径 6378.137km の球面距離）。
- 並び順: 通常は店の ID の昇順。近い10件は距離の近い順。ページ分けはない。
- 一覧の地図のマーカーには、表示中の結果がそのまま出る。

## フラッシュの種類

- `success` と `danger` は DaisyUI の `alert-success` と `alert-danger` のクラスで表示される（`alert-danger` は DaisyUI に無いので無装飾）。
- `notice` と `alert` は `alert-notice` と `alert-alert` になり、無装飾（D-020）。
