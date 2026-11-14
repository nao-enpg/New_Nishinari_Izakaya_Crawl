# 成果物（雛形・技術検証・現行仕様台帳・差分台帳 v0）の独立検証

- 調査日: 2026-11-14（JST）
- 対象
  - 雛形: `/home/claude/work/nishinari-next`（main、HEAD `9764fdb`、コミット4件）
  - 技術検証: `/home/claude/work/poc`（`poc/local`、HEAD `cb8b613`）と `docs/poc/2026-11-14-local-poc.md`
  - 現行仕様台帳 `docs/legacy/*.md`、差分台帳 `docs/deviations.md`
  - 現行コード `/home/claude/nao-enpg/nishinari_izakaya_crawl`（`29c5133`、2024-10-18。`docs/legacy/source/COMMIT` と一致）
- 判定の凡例: **正しい** / **誤り** / **要修正**（大筋は合っているが、不正確・不足がある） / **漏れ** / **未確認**。根拠の種類として、**再現**（実際に動かして確かめた）と**推定**（ソースから推論し、実行はしていない）を区別して書く。
- 調査方法と制約
  - 検証対象のファイルは変更していない。実行はすべて `/tmp/vrf/` の複製で行った（雛形と試作は `git clone` してから `pnpm install --frozen-lockfile`）。終了時に、3つのリポジトリの `git status` が空であることを確認した。
  - `rubygems.org` に届かないため、現行の Rails アプリは起動できなかった。Rails・ransack・sorcery・i18n の挙動は、GitHub にある該当版のソース（raw.githubusercontent.com）で確かめた。
  - Turbo の挙動は、現行と同じ `@hotwired/turbo@8.0.4`・`@hotwired/turbo-rails@8.0.4`（`yarn.lock` の版）を npm から取得し、ERB から書き起こした HTML と turbo-stream の応答を返す模擬サーバーを作り、Chrome（`/usr/bin/google-chrome`、Playwright）で動かした。サーバー側は手書きなので、Rails の実際の描画との差はありうる。
  - 現行の CSS は、`yarn.lock` と同じ `tailwindcss@3.4.3`＋`daisyui@4.11.1` と現行の `tailwind.config.js` でビルドし直して使った。本番の Dockerfile も `yarn install --frozen-lockfile` → `assets:precompile` なので、同じ CSS になる。
  - 本番サイト・旧 DB・Cloudflare API には接続していない。wrangler の匿名テレメトリは、途中から `WRANGLER_SEND_METRICS=false` で止めた（最初の1回だけ送信を試みた）。
  - 起動したサーバー（`vite preview`、模擬サーバー）はすべて止めた。

---

## 0. 要約（重大度「高」「中」）

| ID | 重大度 | 対象 | 要旨 |
| --- | --- | --- | --- |
| H1 | 高 | `.github/workflows/ci.yml:54,77`、`wrangler.jsonc:10,39` | `@cloudflare/vite-plugin` を使う構成では、環境はビルド時の `CLOUDFLARE_ENV` で決まる。CI は環境を指定せずに `pnpm build` しているため、`wrangler deploy --env staging` の `--env` が**黙って無視**され、最上位の設定（Worker 名 `nishinari-next`＝**本番と同じ名前**、D1 はローカル用のダミー ID）でデプロイされる。dry-run で再現した。staging にも本番にも正しくデプロイできない |
| H2 | 高 | 現行 `application_record.rb:4-10`、`izakayas_controller.rb:14,16`（台帳の漏れ） | 現行は ransack の検索条件を全モデル・全列・全関連で許可している。`/izakayas?q[favorites_user_email_start]=a` のような URL で、**ほかのユーザーのメールアドレス、非公開の旅程表名、パスワードのハッシュ、Google の uid を1文字ずつ推測できる**（推定。ソースで確認、実行はしていない）。台帳・差分台帳・計画のバグ一覧のどれにも無い |
| M1 | 中 | `routes.md` R34・R35、差分台帳 D-X01 | 「画面が無く使われていない」とされる `POST /users` と `POST /login` は、**エンドポイントとしては動いている**。誰でもメール認証なしでアカウントを作ってログインできる。他人のメールアドレスを先に登録すると、その人は Google で新規登録できなくなる。メールアドレスの登録有無も分かる（推定）。旧 DB に Google 以外のユーザーがいる可能性があり、移行の紐付けに影響する |
| M2 | 中 | `routes.md:80`、D-020 | 「success は `alert-success` で表示される」は**誤り**。動的なクラス名なので Tailwind が `alert-*` を生成しておらず、**4種類のフラッシュはすべて同じ灰色**になる。CSS を再ビルドし、Chrome で背景色を測って確かめた |
| M3 | 中 | D-019、D-021、`screens.md` S00 | D-019（ライトモードで読めない）を**再現した**。ヘッダーは背景が透明で文字が白いため、ライトモードではトップと問い合わせ以外の**全ページでヘッダーが見えない**。D-021（`<head>` 内の turbo-frame で meta などが body に入る）も Chrome で再現した。台帳本文には、この2件の根拠になる記述が無い |
| M4 | 中 | 計画 1章 l.75、`CLAUDE.md:18`、PoC 報告 c | Prisma 7.10.1＋D1 では、対話型の `$transaction(async tx => …)` は「黙って1文ずつ実行」されるのではなく、**実行前に例外を投げる**（再現）。一方、ネストした書き込み（暗黙のトランザクション）は、途中で失敗しても親の行が**残る**（再現）。`$transaction` を lint で禁止するだけでは足りない |
| M5 | 中 | `routes.md:71`、PoC 報告 b（店名検索） | 現行の ransack は `%` と `_` をエスケープし、前後の空白を除く。Prisma の `contains` はエスケープしないため、「%」や「_」で検索すると**全店が返る**（再現）。全角英字の大文字・小文字の扱いも、Postgres の ILIKE と SQLite の LIKE で違う。台帳にも PoC にも無い |
| M6 | 中 | `ci.yml` | 本番承認の仕組みが成り立たない場合がある。private リポジトリでは、GitHub Free・Pro・Team の環境に「required reviewers」を設定できない。そのほかの問題: `workflow_dispatch` はどのブランチからでも本番に出せる。secrets がリポジトリ単位なら承認の前に使える。`cancel-in-progress` がデプロイを途中で止める。ビルドがマイグレーションの後にあり、PR ではビルドしない。lint が無い |
| M7 | 中 | `.gitignore`、`app/generated/prisma/*` | `app/generated/` は `.gitignore` に入っているが、最初のコミット `4ef868b` で WASM（3.3MB）ごと**追跡済み**のまま。無視の設定が効いていない |
| M8 | 中 | `wrangler.jsonc:10`、`package.json:9` | 最上位の Worker 名が本番と同じ `nishinari-next`。そのため、`pnpm run deploy`（`wrangler deploy` を環境なしで実行）で本番の Worker を上書きしうる |
| M9 | 中 | PoC `test/i18n-typecheck.ts`、報告 g | 「en にキーが欠けると型エラーになる」ことを示すはずのファイルが、実際にはキーを欠いていない（`tsc` で `Unused '@ts-expect-error'` になる）。しかも、どの tsconfig にも入っておらず、一度も型チェックされていない。仕組み自体は正しい（キーを欠かせた別ファイルで確認） |

---

## 1. 指摘（重大度順）

### 【高】H1. CI のデプロイで、環境（staging / production）が選ばれない

- **対象**: `.github/workflows/ci.yml:54`（`pnpm build && pnpm exec wrangler deploy --env staging`）、`:77`（production 側の同じ処理）、`wrangler.jsonc:10`（最上位の `name: "nishinari-next"`）、`:39`（production の `name: "nishinari-next"`）
- **判定**: 誤り（再現）
- **根拠**
  - fresh clone で `pnpm build` すると、`build/server/wrangler.json` は最上位の設定になる（`"name": "nishinari-next"`、`database_name: "nishinari-local"`、`database_id: "00000000-…"`、`targetEnvironment` なし）。`.wrangler/deploy/config.json` はこのファイルを指す（redirected config）。
  - その状態で `pnpm exec wrangler deploy --env staging --dry-run` を実行すると、エラーも警告も出ない。表示された結果は `Using redirected Wrangler configuration.` と `env.DB (nishinari-local)` で、**staging の設定が使われていない**。
  - wrangler 4.162.0 のソース（`wrangler-dist/cli.js` の `normalizeAndValidateConfig`）では、redirected config に `targetEnvironment` が無い場合、`--env` を照合せずに最上位の設定を使う。照合してエラーにするのは、`targetEnvironment` がある場合だけ。
  - `CLOUDFLARE_ENV=staging pnpm build` でビルドすると、`name: nishinari-next-staging`、`targetEnvironment: staging`、staging の D1 になる。その後に `wrangler deploy --env production` を実行すると、「This does not match the target environment "staging"…」で正しく止まった。
  - Cloudflare の公式ページ（[Cloudflare Environments・Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/)、2026-10-12 更新）にも、環境は dev またはビルドのときに `CLOUDFLARE_ENV` で選ぶこと、ビルドの出力は平坦化された設定になること、`wrangler deploy` のときに指定しても効かないことが書かれている。
- **影響**
  - P0 の完了条件「Actions から staging への空デプロイが通る」を満たせない。
  - staging の job も production の job も、本番と同じ名前の Worker `nishinari-next` にダミーの D1 を結び付けてアップロードしようとする。ダミーの ID ならアップロードは失敗するはずだが、誰かが最上位の `database_id` に staging の ID を入れて「直す」と、main への push のたびに**本番の Worker を staging 用のコードで上書きする**。
  - マイグレーションの step は、ビルドより前に実行するので staging 側の D1 に正しく当たる。そのため、「DB だけ移行され、コードは古い（または別の Worker に行く）」状態になる。
- **修正案**
  - `run: CLOUDFLARE_ENV=staging pnpm build && pnpm exec wrangler deploy --env staging`（production も同じ）にする。`--env` は残すと、ビルドとの食い違いを wrangler が止めてくれる。
  - 最上位の `name` を本番と別の名前（例: `nishinari-next-dev`）にする（M8）。
  - CLAUDE.md の「よく使うコマンド」に、「ビルドは `CLOUDFLARE_ENV=<env> pnpm build`。`wrangler deploy --env` だけでは環境は切り替わらない」と書く。

### 【高】H2. 現行の検索 URL から、ほかのユーザーの個人情報を推測できる（台帳の漏れ）

- **対象**: 現行 `app/models/application_record.rb:4-10`、`app/controllers/izakayas_controller.rb:14,16`。台帳 `routes.md` R05（パラメータを `q[name_cont]` と `q[tags_id_all][]` だけと記載）。差分台帳と計画 1章のバグ一覧にも無い。
- **判定**: 漏れ（推定。ライブラリのソースで確認。実行はしていない）
- **根拠**
  - `ApplicationRecord` が `ransackable_attributes` を `authorizable_ransackable_attributes` に、`ransackable_associations` を `authorizable_ransackable_associations` にしている（`application_record.rb:4-10`）。ransack 4.1.1 では、これは「全列」と「全関連」を意味する（`lib/ransack/adapters/active_record/base.rb:78-94` の `column_names …` と `reflect_on_all_associations.map …`）。
  - 一覧は `Izakaya.ransack(params[:q])` に `params[:q]` を丸ごと渡している（`izakayas_controller.rb:14,16`）。ransack は許可されていないパラメータも `to_unsafe_h` で受け取る（`lib/ransack/search.rb:24`）。
  - 関連は Izakaya → `favorites`（`izakaya.rb:6`）→ `user`（`favorite.rb:2`）、および Izakaya → `izakaya_plans` → `plans`（`izakaya.rb:4-5`）→ `user`（`plan.rb:2`）とたどれる。User の全列（`email`、`crypted_password`、`salt`。`schema.rb:85-93`）と、`authentications.uid` も検索条件にできる。
  - そのため、たとえば次の URL が考えられる。
    - `/izakayas?q[favorites_user_email_start]=a`: メールアドレスが a で始まるユーザーがお気に入りに入れた店だけが表示される。1文字ずつ伸ばしていけば、アドレスを特定できる。
    - `q[plans_name_cont]=…`: 非公開の旅程表の名前を推測できる。
    - `q[plans_user_email_start]=…`: 旅程表を作ったユーザーのメールアドレスを推測できる。
    - `q[favorites_user_crypted_password_start]=…`: M1 のパスワードユーザーがいれば、パスワードのハッシュを推測できる。
  - 未知の条件は既定で無視されるだけで、エラーにならない（`configuration.rb:31` の `ignore_unknown_conditions: true`）。`q[s]=name+desc` で並び順も変えられる。
- **修正案**
  - 差分台帳に、バグとして「D-024: 一覧の `q[...]` で任意の列・関連を検索でき、個人情報を推測できる」を追加する。新しい実装では、`q[name_cont]` と `q[tags_id_all][]`（と `lat`・`lng`）以外は無視する、と明記する。あわせて「移植しないもの」に、「ransack の任意の検索条件と `q[s]` の並べ替え」を追加する。
  - `routes.md` R05 に「現行は任意の ransack 条件を受け付ける（上記のバグ）」と書く。
  - **現行の本番が今も漏えいの経路になっている可能性がある**。Nao さんに伝え、旧サイトで `ransackable_attributes` を `%w[name]`、関連を `%w[tags]` に絞る応急処置を検討してもらう。確かめるときは、本番ではなく手元の複製の DB で行う（実在のユーザーのデータを引かないため）。

### 【中】M1. メール/パスワード認証は「使われていない」のではなく、エンドポイントとして動いている

- **対象**: `routes.md` R34（`POST /login`、応答欄が空）、R35（`/users/new` と `/users` で「406」）、差分台帳 D-X01（「画面が無く使われていない」）、`data.md`（users と authentications）
- **判定**: 誤り（R35 の `POST /users`）、要修正（R34、D-X01）。推定
- **根拠**
  - `POST /users` はログイン不要（`users_controller.rb:2`、`routes.rb:9`）。`User.new(user_params)` を保存して `session[:user_id] = @user.id`（`:8-16`）。sorcery はこの値でログイン状態を判定する（sorcery 0.17.0 `lib/sorcery/controller.rb:117,139-141`）。そのため、CSRF トークンさえ取得すれば（トップページの meta にある）、**誰でもメール確認なしでアカウントを作り、ログインできる**。
  - 保存に失敗すると `render :new` を呼ぶが、ビューが無いので `ActionView::MissingTemplate` になる。これは rescue_responses に無いので **500**（Rails 7.1.3.2 `exception_wrapper.rb:10-26`）。メールアドレスの重複は `users.email` の一意検証で失敗するので、「既に登録されているか」が 302 と 500 の違いで分かる。
  - Google ログインの新規登録は `save(validate: false)` で行う（sorcery 0.17.0 `lib/sorcery/model/submodules/external.rb:68`）。先に同じメールアドレスで `POST /users` されていると、`index_users_on_email` の一意制約（`schema.rb:92`）で例外になり、`oauths_controller.rb:17-19` の「ログインに失敗しました」になる。つまり、**特定の人の Google 新規登録を妨害できる**。
  - `POST /login` も動く（`user_sessions_controller.rb:2,5-14`）。成功すると `user_sessions.login_success`（i18n.md では「使われていない訳語」）を表示してトップへ移る。失敗すると `render :new` で 500。
  - その結果、旧 DB には `authentications` の行を持たないユーザー（`crypted_password` があるもの）がいる可能性がある。移行は `authentications.uid` で紐付ける方針（`data.md:102`）なので、こうしたユーザーは紐付けられない。
- **修正案**
  - R34・R35 の応答を「`POST /users`: 作成してログイン（302）。検証に失敗すると 500。`POST /login`: 成功すると 302、失敗すると 500」に直す。
  - D-X01 の理由を「画面は無いがエンドポイントは動いている（推定）。新しい実装では提供しない」に直す。
  - P1 の旧 DB の調査に、次の項目を加える。
    - `crypted_password IS NOT NULL` のユーザーの数
    - `authentications` を持たないユーザーの数
    - `(provider, uid)` の重複。このインデックスは一意ではない（`schema.rb:23`）
    - `authentications.user_id` の孤立。この列は integer で、外部キーも無い（`schema.rb:18`）

    そのうえで、これらのユーザーを移行するかどうかを `data.md` で決める。

### 【中】M2. フラッシュは4種類とも同じ見た目（台帳の記述は誤り）

- **対象**: `routes.md:80`（「success と danger は … alert-success と alert-danger のクラスで表示される」）、D-020（「notice / alert のフラッシュが無装飾」）
- **判定**: 誤り（再現）
- **根拠**
  - クラス名は `alert alert-<%= message_type %>` という動的な文字列（`_flash_message.html.erb:3`）。Tailwind 3 の JIT は、本文に完全な形で書かれたクラスしか生成しない。リポジトリのどこにも `alert-success` などの完全な文字列は無い（`grep` で確認）。
  - 現行と同じ版でビルドした CSS には、`.alert` しか無く、`.alert-success` などは1つも無かった。
  - Chrome で背景色を測ったところ、4種類とも同じだった。ライトモードではすべて `oklch(0.961 0 0)`、ダークモードではすべて `oklch(0.233 0.014 253.1)`。
- **修正案**: `routes.md:80` を「4種類とも DaisyUI の `.alert` の基本の見た目（灰色）で、種類による違いは無い」に直す。D-020 の「現行の振る舞い」を「success・danger・notice・alert の4種類とも見分けがつかない」に直す。

### 【中】M3. D-019・D-021 を再現した。台帳には、その根拠となる記述が無い

- **対象**: D-019（「推定」）、D-021（「推定」）、`screens.md` S00
- **判定**: D-019・D-021 とも、推定から**再現済み**にしてよい。`screens.md` は漏れ
- **根拠（D-019）**: 現行の CSS で、ライトモード（`colorScheme: light`）とダークモードを比べた。
  - ページの背景: ライトでは白（`oklch(1 0 0)`）、ダークでは暗い色。
  - ヘッダーのリンク: 白（`rgb(255,255,255)`）。ヘッダーの背景は透明（`rgba(0,0,0,0)`）（`_header.html.erb:1`、`_before_login_header.erb:1`）。そのため、**ライトモードでは、背景画像のあるトップと問い合わせ以外の全ページで、サイト名・JP/EN・ログイン・マイページ・ログアウトが見えない**。
  - マイページの見出し（`profiles/show.html.erb:9,16`）も、ライトモードでは白地に白。
  - 名前の入力欄（`profiles/edit.html.erb:4`）は、ライトモードでは白地に白い文字、ダークモードでは灰色の地に白い文字。
  - コードを読んだ限りでは、同じ問題が次の箇所にもある。旅程表詳細の見出し（`plans/show.html.erb:2-3`）、規約・プライバシー（`text-white`）、作成・編集フォームの入力欄（`plans/new.html.erb:1,5` で、外側の `text-white` を継承する）、居酒屋詳細のボタン（`izakayas/show.html.erb:13-15` の `btn text-white`）。
  - DaisyUI 4 は OS の設定でライトとダークを切り替える（ビルドした CSS に `@media (prefers-color-scheme: dark)` がある）。
- **根拠（D-021）**: レイアウトの `<head>` を書き起こし、Chrome で開いた。DOMParser でも同じ結果だった。
  - `turbo-frame#modal`、og:title、canonical、favicon、その後ろの script の親要素は、すべて **BODY**。
  - `<title>` は head に1つ、body に1つ。`document.title` は head 側（レイアウトの訳語）。
- **修正案**
  - `screens.md` S00 に次を書く。
    - テーマ: DaisyUI の light / dark を OS の設定で切り替える（`tailwind.config.js:15-17`）
    - ヘッダーは背景が透明で文字が白い
    - `<head>` の中に turbo-frame がある（`layouts/application.html.erb:11`）。そのため、12行目以降の meta・link・script は body に入る
  - D-019・D-021 の状態を「再現（模擬環境）」に更新し、上の箇所の一覧を D-019 に付ける。
  - D-021 の副作用は L3 を参照。

### 【中】M4. Prisma＋D1 のトランザクションの説明が不正確。暗黙のトランザクションも原子性が無い

- **対象**: 計画 1章 l.75（「`$transaction` も1文ずつ実行される」）、`CLAUDE.md:18`（「エラーにならないまま原子性が無い」）、PoC 報告 c、前回レビュー H1（「`$transaction(async tx => …)` も例外にならず」）
- **判定**: 要修正（再現）
- **根拠**（`/tmp/vrf/poc` に検証用のテストを追加して実行）
  - 対話型の `prisma.$transaction(async tx => …)` は、**コールバックを実行する前に**例外「Cloudflare D1 does not support interactive transactions. … use batch transactions with `prisma.$transactions([])` where applicable.」を投げた。データは変わらなかった。`@prisma/client@7.10.1` の `runtime/client.js` に、`adapterName==="@prisma/adapter-d1"` なら例外を投げる分岐がある。
  - 配列形式の `$transaction([...])` は、PoC のとおり原子性が無い。警告 `prisma:warn … will be ignored and run as individual queries` は出るが、失敗した文のエラーはそのまま呼び出し元に返る。この点で、計画の「エラーにならない」は不正確。しかも、Prisma 自身のエラー文が、原子性の無い `$transaction([])` を勧めている。
  - **ネストした書き込み**も原子性が無い。`prisma.plan.create({ data: { …, items: { create: [ {正常}, {存在しない izakayaId} ] } } })` は、外部キー違反で例外になったが、**親の plans の行は残った**（items は0件）。
- **修正案**
  - CLAUDE.md と計画の記述を次のように直す。「対話型 `$transaction` は D1 では例外になる。配列形式とネストした書き込みは、警告だけで、原子性の無いまま1文ずつ実行される。どちらも使わず、原子性が必要なら `env.DB.batch()` か1本の SQL で書く」。
  - lint の禁止対象に、ネストした `create` / `connectOrCreate` / `upsert` を含む書き込み（少なくとも親子を同時に作るもの）を加えるか、コードレビューの観点に入れる。
  - PoC 報告の「まだ検証していないもの」に、この2点を追記する（今回の再現結果で置き換えてよい）。

### 【中】M5. 店名検索の同等性（ワイルドカード・空白・全角英字）が台帳にも PoC にも無い

- **対象**: `routes.md:71`、PoC 報告 b（「店名の部分一致 OK（差あり）」）
- **判定**: 漏れ（PoC 側は再現）
- **根拠**
  - ransack 4.1.1 の `cont` は、PostgreSQL では `escape_wildcards` で `\`・`%`・`_`・`.` をエスケープする（`lib/ransack/constants.rb:56,163-174`）。既定の `strip_whitespace: true`（`configuration.rb:38`、`search.rb:23,27`）で、前後の空白も除く。
  - PoC の `searchIzakayas`（`contains`）で検索すると、`%` も `_` も**全3件を返した**（`/tmp/vrf/poc` で再現）。
  - 全角英字の「ａｂｃ」は「ＡＢＣ酒場」に一致しなかった（SQLite の LIKE は ASCII しか大文字・小文字を区別しない）。Postgres の ILIKE は、DB のロケールによっては一致する（**未確認**）。
- **修正案**
  - `routes.md` の検索仕様に、次の3点を書く。
    - `%` と `_` を文字どおりに扱う
    - 前後の空白を除く
    - 全角英字の大文字・小文字の扱い（要確認）
  - F4 の実装では、`LIKE ? ESCAPE '\'` を自前で書くか、`contains` の前に値をエスケープする。
  - 全角英字の違いは、差分台帳に Q 項目として追加する。旧 DB の `LC_CTYPE` を P1 の DB 調査で確認する。

### 【中】M6. CI: 本番承認・secrets・ブランチ・同時実行・順番

- **対象**: `.github/workflows/ci.yml`
- **判定**: 要修正
- **根拠と修正案**
  1. **承認の仕組み**: `environment: production` に付けたコメント（`:63`）は「Nao の承認を必須にする」。しかし GitHub の公式ページ（[Managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)）によると、Free・Pro・Team では、required reviewers や wait timer は public リポジトリでしか使えない。private リポジトリで environments を使うには Pro・Team・Enterprise が必要。新リポジトリの公開範囲とプランを P0 で確認し、承認が使えない場合の代わりの手段を決める（例: 本番デプロイを Nao さんが手で dispatch するだけにする、タグ push で起動する）。「Prevent self-review」を使うかどうかも決める。
  2. **ブランチの制限が無い**: `:61` は `workflow_dispatch && inputs.deploy_production` だけで、ブランチを見ていない。どのブランチからでも本番に出せる。`github.ref == 'refs/heads/main'` を条件に加え、environment の「Deployment branches」も main に限定する。
  3. **secrets**: Cloudflare のトークンをリポジトリの secrets に置くと、承認の前に、どのブランチの workflow からでも使える（Claude が push できるので、変更した ci.yml から使えてしまう）。staging と production の environment secrets に分けて置く。
  4. **concurrency**: `group: ${{ github.workflow }}-${{ github.ref }}` と `cancel-in-progress: true`（`:14-16`）。main への push と main からの dispatch が同じ group になる。そのため、本番デプロイ（承認待ちや実行中を含む）が、後から来た push で取り消される。マイグレーションの途中で止まることもある。デプロイの job には `cancel-in-progress: false` を設定した別の group を使う。
  5. **順番**: デプロイの job では、マイグレーション（`:50,:73`）の**後に** `pnpm build` している（`:54,:77`）。ビルドが失敗すると、DB だけ先に変わる。check の job でもビルドしていないので、PR でビルドの失敗に気付けない。ビルドを check の job に入れ、デプロイの job は「ビルド → マイグレーション → デプロイ」の順にする。
  6. **lint が無い**: 計画 P0 は「型チェック・lint・テスト」。計画 1章は「`prisma.$transaction` は lint で禁止する」。しかし ESLint などの設定も、CI の step も無い。
  7. その他（低）
     - `permissions:` が無い。`contents: read` を明示する。
     - actions のタグが古い。`actions/checkout` と `actions/setup-node` は v7、`pnpm/action-setup` は v6.1.1 まで出ている（`git ls-remote` で確認）。SHA で固定することも検討する。
     - `pnpm/action-setup@v4` は `runs.using: node20`。[2026-09-23 から、ランナーは JavaScript の action を Node 24 で動かす](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions)。
     - checkout の `persist-credentials: false`、`timeout-minutes` も付けるとよい。

     妥当だった点もある。
     - pnpm/action-setup は `package.json` の `packageManager` を読む（`action.yml` の `package_json_file` の既定値は `package.json`）。setup-node の `cache: pnpm` は pnpm の後に置かれている。
     - `--frozen-lockfile` は fresh clone で通った。
     - `wrangler d1 migrations apply DB --env staging --remote` の書き方は正しい。非対話の環境では、確認に既定の yes で答える（`cli.js` の `confirm2`）。
     - secrets は必要な step にだけ渡している。

### 【中】M7. `app/generated/` が、無視の設定に反して追跡されている

- **対象**: `.gitignore`（最終行の `app/generated/`）、`git ls-files app/generated`（11ファイル。`query_compiler_fast_bg.wasm` を含み、合計 3.3MB）
- **判定**: 要修正
- **根拠**: 生成物は `4ef868b`（雛形）で追加された。無視の設定はその後の `db5cb97` で足された。すでに追跡しているファイルには `.gitignore` が効かない。今の生成物は、生成し直しても差分が出ない（今回、generate の後の `git status` は空だった）。しかし、スキーマを変えるたびに生成物の差分がコミットに混ざる。
- **修正案**: `git rm -r --cached app/generated` をコミットする。CI と開発手順では `prisma generate` を必ず実行する（すでにそうなっている）。PoC のブランチも同じ状態。

### 【中】M8. 最上位の Worker 名が本番と同じ

- **対象**: `wrangler.jsonc:10`（`"name": "nishinari-next"`）、`:39`（production の `"name": "nishinari-next"`）、`package.json:9`（`"deploy": "npm run build && wrangler deploy"`）
- **判定**: 要修正
- **根拠**: 環境を付けずにビルドとデプロイをすると、最上位の設定、つまり本番と同じ名前の Worker に、ダミーの D1 を結び付けて送る（H1 と同じ仕組み）。dry-run で `env.DB (nishinari-local)` を確認した。
- **修正案**: 最上位の `name` を `nishinari-next-local` などにする。`deploy` スクリプトを削除するか、`CLOUDFLARE_ENV` を必須にする。ローカルの database_id のダミー値は、`pnpm test`、`d1 migrations apply --local`、`vite preview` のどれでも問題が無かった。

### 【中】M9. PoC の「型付き辞書は、キーが欠けると型エラーになる」は、検証になっていない

- **対象**: PoC `test/i18n-typecheck.ts`、`tsconfig.cloudflare.json` の include、報告 g
- **判定**: 誤り（検証方法）。結論は正しい
- **根拠**
  - `broken` は、ja のキー（header の4つ、`plans.index.confirmDelete`、`plans.publicFalse`）を**すべて持っている**。tsconfig を作って型チェックすると、`test/i18n-typecheck.ts(2,1): error TS2578: Unused '@ts-expect-error' directive.` になった。
  - `test/` はどの tsconfig の include にも入っていない。そのため、`pnpm typecheck` でも vitest でも型チェックされず、この誤りに気付けなかった。
  - `logout` を欠かせた別のファイルでは、`@ts-expect-error` が成立した（exit 0）。仕組みそのものは有効。
- **修正案**: テストのファイルを直し、`test/` を型チェックの対象に入れる（例: `tsconfig.test.json` を作って `tsc -b` の参照に加える）。vitest の `typecheck` を使ってもよい。en の `header.login` が「Login with Google」になっていて、現行の「Google Login」と違う点も直す（PoC の文言でも、現行どおりを守る）。

### 【低】L1〜L18

| ID | 対象 | 判定 | 根拠 | 修正案 |
| --- | --- | --- | --- | --- |
| L1 | D-013、`behaviors.md:31` | 要修正（模擬環境で再現） | サーバー側は推定どおり。`favorite_izakayas << izakaya` は has_many :through の `save!` を通る（Rails 7.1.3.2 `has_many_through_association.rb:81-84`）ので、2回目は `RecordInvalid` → 422。ただし、ダブルクリックでは Turbo が1回目の fetch を中断し（`ERR_ABORTED`）、2回目の 422 応答（`public/422.html`）を描画しようとする。その HTML には現行の `data-turbo-track` の資産が無いので、`tracked_element_mismatch` で**ページ全体を再読み込み**する（`turbo.es2017-esm.js:3350-3365,4590`）。利用者に見えるのは「エラー画面」ではなく、再読み込みと、お気に入りが1件登録された状態。2つの要求が同時に検証を通ると、一意制約が無いため**重複行**ができる | D-013 の「現行」を「サーバーは 422。画面は全体が再読み込みされる。同時に届くと重複行ができる」に直す |
| L2 | D-003、D-011、`behaviors.md:54` | 要修正（模擬環境で再現） | 名前を空にして送ると、422 でフォームが再表示されるが、フラッシュ（`flash.now['danger']`）は表示されない。レイアウトにあるフラッシュは、Turbo Frame の抽出で捨てられる。成功時のフラッシュも、D-011 のとおり表示されない。そのため、D-003 の「Translation missing」が見えるのは、JavaScript が無効なときの HTML 形式の応答だけ | `behaviors.md:54` から「フラッシュ（…）」を外し、「表示されない」とする。D-003 の現行の欄に「通常の操作では表示されない（D-011）」と追記する |
| L3 | D-021 の副作用、`external.md`（GA） | 漏れ（模擬環境で再現） | GA の inline script は turbo-frame より後ろなので body に入り、Turbo の画面遷移のたびに**再実行される**。2回遷移すると、実行回数が 1 から 3 になった。同じウィンドウであることも確認した。そのため、現行では Turbo の遷移ごとに `gtag('config')` が呼ばれ、page_view が送られていると考えられる。Font Awesome と jQuery の script も毎回入れ直される | `external.md` の GA 欄に「現行は D-021 の副作用で、遷移ごとに page_view を送っている（推定）」と書く。F1 の受け入れ条件「クライアント側の遷移で page_view を送る」の根拠にする |
| L4 | 差分台帳の ID と分類 | 要修正 | D-006 は理由の書かれていない欠番（git の履歴にも記述が無い）。英語の `footer.tag` は `views/en.yml:87` にあり、訳の抜けではない。D-014 と D-015 は Q 表にあるのに D の番号を使っている。D-016 は「要確認」付きなのに D 表にある。D-022 の「description を設定する」は追加。C-014（0バイトの favicon）はバグ修正に当たる。C-006 は、計画 1章では「現行のバグ」に入っている。X 表には状態の列が無い | 「D-006: 欠番（`footer.tag` の英訳欠落と誤認して取り下げ。en.yml:87 に存在）」と1行残し、番号を再利用しないと冒頭に書く。分類をそろえる。X 表にも状態の列を設ける |
| L5 | D-X06 | 要修正 | `top.jpg` は 19,733,599 バイト（18.8MiB）で、[静的ファイルの上限 25MiB](https://developers.cloudflare.com/workers/platform/limits/) を超えない。超えるのは `eyecatch.gif`（41.6MB）だけ | 理由を「eyecatch.gif は上限超え。top.jpg は未使用」に分ける |
| L6 | D-016、D-017 | 要修正 | マイページの旅程表カード（`plans/_plan.html.erb:2`）も `plan.izakayas.first` で、並べ替えの順ではない。D-017 が起きるのは「店が1件も無い旅程表」のとき（`'izakaya'` が渡る）。店はあるが写真が無いときは `url('')` になる | D-016 にマイページを追加し、D-017 の条件を直す |
| L7 | `data.md` | 漏れ | `row_order` は 2024-09-12 のマイグレーションで、値を埋めずに追加された（`20240912155724_add_row_order_to_izakaya_plans.rb`）。それ以前の行は NULL の可能性があり、現行は Postgres の ASC で NULL を最後に並べる。そのほか次の点が書かれていない。`plans.public` は NULL を許し、既定値が無い（`schema.rb:72`）。`users.email` は一意（`:92`）。`authentications (provider, uid)` は一意ではない（`:23`）。`authentications.user_id` は integer で、外部キーが無い（`:18`） | 移行で「row_order が NULL の行は最後、その中は id 順」などの規則を決める。`public` の NULL は false にする。旧 DB の調査項目に加える（M1 も参照） |
| L8 | `routes.md` | 漏れ | R13: 存在しない旅程表は 404（`plans_controller.rb:10` の `find`）。R30・R31: Google の同意画面で取り消すと、`code` の無いまま callback に来る。`login_from` が begin/rescue の外にある（`oauths_controller.rb:11`）ので、500 になる（推定）。R05: 座標が NULL の店が1件でもあると、近い10件は 500 になる（`izakayas_controller.rb:25`）。新しい実装では、期限切れの座標を使わない（C-007）ので、NULL の店を除く必要がある | 各行に追記する。F4 の spec に「座標の無い店は近い10件から除く」と書く |
| L9 | `i18n.md` | 漏れ | 直書きの文言に次が抜けている。meta-tags の `site`・`title`（「西成泥酔旅行」が英語の画面でも日本語。`application_helper.rb:4-5`、`plans_controller.rb:17-23`）、問い合わせの placeholder「example@mail.co.jp」、「JP」「EN」。使われていない訳語に `activerecord.models.izakaya` / `plan` と `activerecord.attributes.izakaya.name` が抜けている。`plans.show.description` の ja は「ドラックアンドドロップ」と誤字がある | 追記する。誤字は直すかを Q 項目にする |
| L10 | レイアウト | 漏れ | 現行の `<html>` には `lang` が無く、`<meta charset>` も無い（文字コードは応答ヘッダーで指定）。雛形の `root.tsx:28` は `lang="ja"` の固定 | 「`lang` を言語に合わせる」を差分台帳の意図的な変更として記録する |
| L11 | PoC 報告 | 要修正 | ①「有料プランの上限 10MB」は古い。[現行の上限](https://developers.cloudflare.com/workers/platform/limits/)（2026-11-13 更新）は Free・Paid とも**非圧縮で 64MiB**で、圧縮後の上限は無い。結論（収まる）は変わらない。② Cron の handler はあるが、`wrangler.jsonc` に `triggers.crons` が無い（ビルド出力の `"triggers": {}`）。③ batch のテストの失敗が「存在しない表」で、文の準備の段階のエラーになっている。実行時のエラー（主キーの重複、外部キー違反、3文目での失敗）でも巻き戻ることを追加で確かめ、結論は正しかった。④ npm がクラッシュしたのは旧構成（vitest 4.1.12＋`vitest-pool-workers` 0.23.0。`db5cb97` の package.json）。今の package.json では、npm 10.9.9 でもインストールできた。⑤ プレビューの再現手順（`d1 migrations apply --local` と `seed-local.sql`）が書かれていない。⑥ `poc/local` は `/home/claude/work/poc` の中だけにあり、nishinari-next のリポジトリには無い | 報告を直す。①には `wrangler check startup` の値（ローカルで profile window 55.9ms）を参考として足す |
| L12 | `CLAUDE.md` | 要修正 | `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true` のまま `prisma migrate diff --from-empty --to-schema …` を実行すると、**何も出力せず exit 0** になった（`--exit-code` を付けても 0）。空のマイグレーションをコミットしてしまう恐れがある。l.14 の「npm が peer 解決でクラッシュ」は、今の構成には当てはまらない（L11 ④）。`CLOUDFLARE_ENV`（H1）の記述が無い | 「この変数は `generate` のときだけ付け、export しない。migrate diff はここでは**空の結果を正常終了で返す**ので使わない」と書く。H1 の手順を足す |
| L13 | 雛形のその他 | 要修正 | `README.md` が C3 のテンプレートのまま（npm の手順）。`test/` と `vitest.config.ts` が型チェックされない（M9）。`package.json` の `deploy` と `preview` が `npm run` を使っている | 整える |
| L14 | C-015 と Workers Logs | 漏れ | `observability.enabled: true`（`wrangler.jsonc:14-16`）では、呼び出しのログに要求の URL が記録される（[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)、2026-11-12 更新）。近い10件を現行どおり `GET /izakayas?lat=…&lng=…` にすると、C-015 と矛盾する。`workers_dev` と `preview_urls` が既定のままなので、本番も staging も `*.workers.dev` から見える | C-015 の実現方法として、`observability.logs.invocation_logs: false` にするか、座標を URL に載せないようにする（意図的な変更として記録）。本番は `workers_dev: false` にする。staging は計画 P6 のとおり、noindex とアクセス制限を付ける |
| L15 | `behaviors.md`（地図） | 漏れ（推定） | `/izakayas` の本文にある `<script async defer src=…maps…&callback=initMap>`（`index.html.erb:123`）は、Turbo で再訪するたびに入れ直される。そのため、Maps JS が何度も読み込まれ（Google の「included the Google Maps JavaScript API multiple times」の警告）、地図の初期化の課金も増えると考えられる | C-006 の根拠に追記する |
| L16 | D1 のマイグレーションの検査（`scripts/check-migrations.sh`） | 補足（再現） | ローカルの D1 で、Prisma が出すのと同じ「テーブルの作り直し」の SQL を試した（`/tmp/vrf/fk`）。**ON DELETE CASCADE の子の行は 2→0 に消えた**。PoC と同じ RESTRICT では、子の行は残り、マイグレーションも成功した。検査スクリプトは、行頭の `DROP TABLE` を大文字・小文字の区別なく検出する。しかし、`;` の後ろに続けて書かれたものや、行をまたぐものは見逃す | 計画 P3-4 の「DB の連鎖削除に頼るか」は、「CASCADE を使わない」と決め、スキーマに `onDelete: Cascade` が無いことも CI で検査する方向が妥当。ただし、遠隔の D1 では未確認 |
| L17 | 「承認済み」の出典 | 要修正 | C-001・C-003・C-007・C-008・A-001 の承認済みは、計画 v0.4 の 0章の決定と一致する。ただし出典が書かれていない。計画は「権限漏れなどのバグは直す」「使われていないコードは移植しない」「Google 由来のデータは移さない」も決めているが、D-001・D-002 は承認待ち、D-X は状態無しになっている | 承認済みの欄に「計画 v0.4 0章」などの出典を書く。計画で決まっているものは、状態をそろえる |
| L18 | 台帳の README | 要修正 | 「行番号は `source/COMMIT` の版のもの」とあるが、本文にはほとんど行番号が無い | 第2章の表の行番号を取り込む |

---

## 2. 依頼1: 現行仕様台帳の裏取り

行番号は、現行コード（`29c5133`）のファイルの行。`docs/legacy/source/` の locales・static_pages・images は、元のファイルとバイト単位で一致した（`cmp`）。

### 2.1 routes.md

| 台帳の項目 | 判定 | 根拠（ファイル:行） |
| --- | --- | --- |
| 全内部 URL に `?locale=` | 正しい | `application_controller.rb:7-9` |
| `require_login` と `skip_before_action` でログインの要否が決まる | 正しい | `application_controller.rb:2`、各コントローラの2行目 |
| 未ログインは `/login` → 406・空白（D-010） | 正しい | `application_controller.rb:13-15`、`routes.rb:12`。`app/views/user_sessions/` は無い。Rails 7.1.3.2 `exception_wrapper.rb:18`（MissingExactTemplate → 406）、`show_exceptions.rb:73-76`（本文0バイト） |
| R01〜R04 | 正しい | `routes.rb:4-7`、`static_pages_controller.rb:2` |
| R05 のパラメータ | 要修正 | `q[name_cont]`（`index.html.erb:5,8`）、`q[tags_id_all][]`（`:24`）、`lat`・`lng`（`:43-45`）は正しい。ただし任意の ransack 条件も受け付ける（H2） |
| R06 HTML / 404 | 正しい | `izakayas_controller.rb:51` |
| R07 常に 500 | 正しい | `izakayas_controller.rb:2`（全アクションでログイン不要）、`:55-58`（存在しない `favorites_izakayas`）。`routes.rb:20-24` で show より先に定義されている |
| R08 | 正しい | `favorites_controller.rb:2-10`、`routes.rb:25` |
| R09 | 正しい | `favorites_controller.rb:12-25`。turbo-rails が DELETE を POST＋`_method` に変える（`fetch_requests.js`）ので、302 の後は GET になる |
| R10 | 正しい | `plans_controller.rb:2,6` |
| R11・R12 | 正しい | `plans_controller.rb:26-39`、`activerecord/ja.yml`（plans.create.success）。モデルに検証が無い（`plan.rb`） |
| R13 | 要修正 | `plans_controller.rb:10-13`（`t('.plans.public_false')` の誤り）。存在しない ID の 404 が書かれていない（L8） |
| R14〜R16 | 正しい | `plans_controller.rb:3,41-54,58-60`。`plan.rb:3` で dependent: :destroy |
| R17〜R19 | 正しい | `izakaya_plans_controller.rb:5-13,15-18,20-23,27-30`。`sortable_controller.js:14-19` |
| R20〜R22 | 正しい（R22 に補足） | `profiles_controller.rb:4-18`。名前が空のときのフラッシュは表示されない（L2） |
| R30〜R32 | 正しい（R31 に補足） | `routes.rb:14,16-18`、`oauths_controller.rb:8-22`、`user_sessions_controller.rb:16-20`。取り消すと 500（L8、推定） |
| R33 | 正しい | 上記の D-010 と同じ |
| R34・R35 | **誤り**（R35 の POST）／要修正 | M1 |
| R36・R37 | 正しい | `routes.rb:11,34`、`sessions_controller.rb`（要ログイン） |
| 検索: ILIKE、AND、同時に使えない、近い10件の計算、並び順、地図 | 正しい（エスケープは漏れ） | `izakayas_controller.rb:5-17`。ransack は `tags_id_all` を述語として認識しないので無視する（`predicate.rb` の `detect_from_string` と、`condition.rb:35-42` の `ignore_unknown_conditions`）。実際の AND は手書きの `GROUP BY … HAVING COUNT` で行っている（`:9-13`）。`:20-42`（6378.137km）、`:44`。M5 |
| フラッシュの種類 | **誤り** | M2 |

補足（台帳に無い細部）
- タグの AND は `COUNT(tags.id) = 選んだ数` で判定している（`izakayas_controller.rb:12`）。`izakaya_tags` に重複行があると、誤って一致することがある。新しい実装は複合主キーにするので起きない。

### 2.2 screens.md

| 台帳の項目 | 判定 | 根拠 |
| --- | --- | --- |
| S00 の title 2つ、OGP、Twitter カード | 正しい | `application.html.erb:4,12`、`application_helper.rb:4-18` |
| S00 で読み込むもの | 正しい | `application.html.erb:14-24` |
| S00 ヘッダー（固定、白文字、ログインの有無で分岐、`/` 直書き） | 正しい（背景が透明なことと、ライトモードの問題が漏れ） | `_header.html.erb:1,4-6,10`、`_before_login_header.erb:1,4-6,9-12`、`application.html.erb:28-32`。M3 |
| S00 フラッシュ `pt-16` | 正しい | `_flash_message.html.erb:1` |
| S01 トップ | 正しい | `top.html.erb:2-23` |
| S02 一覧 | 正しい | `index.html.erb:2-46,125-157` |
| S03 詳細 | 正しい | `show.html.erb:1-19`、`izakayas_controller.rb:51` |
| S04 旅程表一覧（幅 384px＝`w-96`、1件目の写真、本人だけに edit・delete） | 正しい | `plans/index.html.erb:2-6,11,13-14,23-26` |
| S05 作成・編集 | 正しい | `plans/new.html.erb:5,10,15`、`edit.html.erb:15`。ラベルは `activerecord.attributes.plan.*` |
| S06 詳細 | 正しい | `plans/show.html.erb:1-48`、`plans_controller.rb:17-23` |
| S07 マイページ | 正しい | `profiles/show.html.erb`、`favorites/_favorites.html.erb`、`plans/_plan.html.erb` |
| S08 問い合わせ | 正しい | `contact.html.erb:4-15`（`label_tag :email` と入力欄の id `entry.1932653243` が対応していない） |
| S09〜S11 | 正しい | `terms.html.erb:1`、`privacy_policy.html.erb:1`、`public/404.html` など |

### 2.3 behaviors.md

| 台帳の項目 | 判定 | 根拠 |
| --- | --- | --- |
| Turbo Drive、`data-turbo-confirm` | 正しい | `application.js:2`、`plans/index.html.erb:25` |
| 開閉ボタン | 正しい | `index.html.erb:50-82` |
| 地図（`callback=initMap`、毎回作り直す、中心とズーム、Marker、`to_json`） | 正しい（L15 が漏れ） | `index.html.erb:84-107,123` |
| 現在地（エラー処理なし、英語の alert、GET） | 正しい | `index.html.erb:109-121` |
| お気に入り（Turbo Stream の ID） | 正しい | `favorites/_favorite.html.erb:1`、`_unfavorite.html.erb:1`、`create/destroy.turbo_stream.erb` |
| お気に入りの2回押し | 要修正 | L1 |
| 旅程表への追加と失敗時の動き | 正しい | `index.html.erb:142-148`、`izakaya_plans_controller.rb:8-12`、`izakaya_plan.rb:5` |
| 並べ替え（SortableJS、`bg-red-300`、ハンドルが効かない、失敗を無視） | 正しい | `sortable_controller.js:6-20`、`plans/show.html.erb:24-27`。request.js 0.0.11 は JSON の本文を送り、CSRF トークンを付ける |
| 名前のその場編集（D-011・D-012） | 正しい（**再現**）、ただし l.54 は要修正 | 模擬環境の1回目: `turbo-frame#profile` と `#edit_profile` が消え、フラッシュは表示されない。2回目: `/profile/edit?locale=ja` へ全体が移動し、フォームだけが残る。そこで送信するとフォームも消え、ヘッダーだけになる。L2 |
| 削除の確認 | 正しい | `views/ja.yml:46,54`、`en.yml:53`（index に無い） |
| ログイン | 正しい | `oauths_controller.rb:8-22,30-33`。sorcery は Google の v1 userinfo の `id` を uid にする（`providers/google.rb:20,29`） |

### 2.4 data.md

| 台帳の項目 | 判定 | 根拠 |
| --- | --- | --- |
| スキーマの版 2024-09-26 | 正しい | `schema.rb:13` |
| izakayas の列と型 | 正しい | `schema.rb:55-67` |
| tags と izakaya_tags（重複を防ぐ制約が無い） | 正しい | `schema.rb:46-53,79-83` |
| users と authentications | 要修正 | `schema.rb:17-25,85-93`。L7、M1 |
| plans・izakaya_plans・favorites | 要修正 | `schema.rb:27-44,69-77`。L7 |
| 外部キーと `dependent: :destroy` | 正しい | `schema.rb:95-101`、`user.rb:3,7`、`plan.rb:3`、`izakaya.rb:6` |
| Koyeb の PostgreSQL（米国東部） | 未確認 | 計画からの転記。DB には接続できない |

### 2.5 i18n.md

| 台帳の項目 | 判定 | 根拠 |
| --- | --- | --- |
| 言語の決め方、未知の値で 500（D-009） | 正しい | `application_controller.rb:17-19`、`config/application.rb:35-36`。i18n 1.14.5 の `enforce_available_locales!`。空の `?locale=` も 500 になる（`""` は真として扱われるため） |
| 本番のフォールバック | 正しい | `production.rb:82` |
| D-023（言語の漏れ、推定） | 正しい（推定のまま。ソースで裏付け） | `I18n.config` は `Thread.current[:i18n_config]`（i18n 1.14.5 `lib/i18n.rb:56-57`）。Rails 7.1.3.2 は要求ごとに初期化しない（activesupport の railtie で初期化しているのは ExecutionContext と CurrentAttributes だけ）。Rails ガイド `guides/source/i18n.md:146` に、まさにこの漏れの注意がある。Puma は5スレッド（`puma.rb:10-12`）。ただし、転送先の `/login` は D-010 で空白なので、**現行では利用者に見える影響は無い** |
| 言語の指定が消える5か所と、切り替えでクエリが消えること | 正しい（ほかには無い） | `_header.html.erb:4`、`index.html.erb:5,43,104`、`oauths_controller.rb:12,16`。フッター・タグ・クリア・戻るなどは path ヘルパーなので言語を保つ。ログアウトも `locale` が本文で渡る |
| 訳の抜けとキーの誤り3件 | 正しい | `views/ja.yml:46` は en に無い。`activerecord/ja.yml:28`（`plofiles`）、`en.yml:28`、`plans_controller.rb:12`。ja と en のキーを機械的に比べたところ、差はこの3件だけだった |
| 直書きの文言 | 要修正（漏れ） | L9 |
| 使われていない訳語 | 要修正（漏れ） | L9。`user_sessions.login_*` は、動いている `POST /login` から使われうる（M1） |

### 2.6 external.md

| 台帳の項目 | 判定 | 根拠 |
| --- | --- | --- |
| 外部サービスの一覧 | 正しい | `application.html.erb:14-24`、`index.html.erb:123`、`contact.html.erb:4`、`footer.html.erb`、`plans/show.html.erb:13`、`izakayas/show.html.erb:15`、`izakaya_import.rake:15-37` |
| SEO | 正しい（D-021 の影響が漏れ） | `application_helper.rb`、`public/robots.txt`。canonical と og が body に入る（M3）。Google は body にある canonical を扱わないとされている（一般的な指針。今回は文書を確認していない） |
| 静的ファイル | 正しい（L5） | `app/assets/images/*` のサイズ（`ls -la`）、`public/*`（0バイト） |
| ホスティングとセキュリティヘッダー | 正しい | `production.rb:52,91` |

### 2.7 D-001〜D-023 の判定

| ID | 判定 | 補足 |
| --- | --- | --- |
| D-001 | 正しい | `plans_controller.rb:3,58-60` |
| D-002 | 正しい | `izakaya_plans_controller.rb:5-13,27-30` |
| D-003 | 正しい（見え方は L2） | |
| D-004 | 正しい | 遅延参照で `plans.show.plans.public_false` を探し、既定値の `plans.plans.public_false` も無い |
| D-005 | 正しい | |
| D-007 | 正しい | `izakaya_plans_controller.rb:9,11,17`、`favorites_controller.rb:23` |
| D-008 | 正しい | 2.5 |
| D-009 | 正しい | 空の値も 500 |
| D-010 | 正しい | 2.1 |
| D-011 | 正しい（**再現**） | |
| D-012 | 正しい（**再現**） | |
| D-013 | 要修正 | L1 |
| D-016 | 要修正（範囲） | L6 |
| D-017 | 要修正（条件） | L6 |
| D-018 | 正しい | |
| D-019 | 正しい（**再現**）、範囲は M3 | |
| D-020 | **誤り**（現行の記述） | M2 |
| D-021 | 正しい（**再現**） | 副作用は L3 |
| D-022 | 正しい | |
| D-023 | 正しい（推定。ソースで裏付け） | 現行では見える影響が無い |
| D-014・D-015 | 正しい | `schema.rb:36-44`（一意制約なし）、`schema.rb:71`、`plan.rb` |

### 2.8 前回レビュー 3.4節（22項目）の反映

22項目すべてが、台帳か差分台帳に反映されていた。

| # | 反映先 |
| --- | --- |
| 1 | D-005、`screens.md` S04 |
| 2 | D-008、`i18n.md` |
| 3 | D-009 |
| 4 | `external.md` の SEO、S00 |
| 5 | D-022 |
| 6 | C-006、`behaviors.md` の地図 |
| 7 | `behaviors.md:15-16` |
| 8 | Q-008、C-015、`behaviors.md` の現在地 |
| 9 | Q-001 |
| 10 | S02・S03 |
| 11 | D-013 |
| 12 | D-007 |
| 13 | Q-006、C-013 |
| 14 | Q-003 |
| 15 | S08 |
| 16 | C-014、`external.md` |
| 17 | D-019 |
| 18 | D-016、D-017 |
| 19 | D-018、`behaviors.md` |
| 20 | C-009、Q-005 |
| 21 | D-015、S05 |
| 22 | `external.md` のヘッダー |

ただし、#8 の「位置情報を拒否されても何も起きない」と、S08 の「`label` の `for` が対応していない（要確認）」には、Q 項目が無い。

### 2.9 台帳に無い現行の機能・挙動・バグ（まとめ）

1. ransack の任意の条件で、個人情報を推測できる（H2）
2. `POST /users` と `POST /login` が動いている（M1）
3. フラッシュの4種類が同じ見た目（M2）
4. ライトモードでヘッダーが見えない（M3）
5. ダブルクリックしたときの、実際の見え方と重複行（L1）
6. 名前のその場編集で、422 のフラッシュが見えない（L2）
7. GA の page_view が、Turbo の遷移ごとに送られている（L3）
8. Maps JS を何度も読み込む（L15）
9. 店名検索のワイルドカードと空白の扱い（M5）
10. 旅程表が存在しないときの 404、Google での取り消しで 500、座標が NULL の店があると近い10件が 500（L8）
11. `row_order` の NULL、`plans.public` の NULL、`authentications` の非一意（L7）
12. 直書きの文言と誤字（L9）
13. `<html lang>` が無い（L10）
14. Rails が既定で出しているルート（`/rails/active_storage/*` など）と `.json` 形式。移植しないなら X 表に一言書いておけば足りる（低）

---

## 3. 依頼2: 差分台帳の整合性

- **台帳から差分台帳への参照**: 台帳が参照している 26 個の ID（D-001〜D-005、D-007〜D-018、D-020、D-022、D-023、D-X02、C-001、C-003、C-004、C-006、C-010）は、すべて差分台帳にある（`grep` で照合）。
- **差分台帳の根拠が台帳にあるか**: 多くの項目は台帳の本文に根拠がある。**D-019 と D-021 には根拠となる記述が無い**（M3）。C-002・C-005・C-009・C-011〜C-015、Q-001〜Q-008、A-001・A-002 は、台帳から ID で参照されていない。README の約束では「（バグ）には ID を併記」とあるので、要確認の項目にも Q の ID を併記するとよい（低）。
- **D-006 の欠番**: 英語の `footer.tag` は実在する（`views/en.yml:87`、"#Nishinari_Izakaya_Crawl"）。そのため、訳の抜けの項目として立てる理由は無い。欠番にしたこと自体は問題ないが、理由が書かれておらず、git の履歴にも残っていない（コミット1回で追加された）。後で番号を再利用したり、抜けを疑われたりしないよう、欠番の行を残す（L4）。
- **承認済みの項目と計画 v0.4 の照合**
  - 一致: C-001（Firebase の Google ログイン、旧ユーザーは Google の ID で紐付け）、C-003（写真は表示のたびに取得、遅延読み込み・上限・代替画像・撮影者の表示）、C-007（座標は30日以内に更新）、C-008（shadcn/ui。見た目は多少変わってよい）、A-001（営業時間と閉業の表示は追加改修）。いずれも計画 0章・1章と矛盾しない。
  - ただし、出典が書かれていない。計画で決まっている D-001・D-002（権限漏れを直す）と、X 表（移植しない・Google のデータは移さない）の状態がそろっていない（L17）。
  - C-012 は「非表示にする」と書いているが、計画 4章では「非表示か、掲載終了の案内か」は P2 で決めることになっている。承認待ちなので矛盾ではない。ただし、本文を「非表示または案内（P2 で決める）」にしておくのが正確。
- **分類**: L4 を参照。大きな誤分類は無い。ただし、D-X01（M1）と、D-020 の現行の記述（M2）は直す必要がある。

---

## 4. 依頼3: 技術検証の結果の再現

### 4.1 テスト

- `/tmp/vrf/poc`（`poc/local` を clone し、`pnpm install --frozen-lockfile`）で `pnpm exec vitest run` を実行した。結果は **2ファイル・9件すべて成功**で、報告どおり。$transaction のテストでは、`prisma:warn Cloudflare D1 does not support transactions yet…` と `UNIQUE constraint failed: tags.id` が出た。
- 検証方法の評価
  - **`$transaction([...])`**: 妥当。1文目の更新が残り、2文目が実行時に失敗している（主キーの重複）。ただし、対話型と、ネストした書き込みは試していない（M4。今回、追加で再現した）。
  - **`batch()`**: 弱い。失敗させた文が `INSERT INTO no_such_table` で、準備の段階で失敗する。D1 が全文を先に準備してから実行する実装だと、「巻き戻った」のではなく「何も実行されなかった」可能性を排除できない。そこで、次のテストを追加した。
    - 対照: 1文目だけなら更新される
    - 2文目が主キーの重複で失敗する
    - 2文目が外部キー（RESTRICT）違反で失敗する
    - 3文目で失敗し、1文目と2文目の両方が巻き戻る

    4件すべてで巻き戻りを確認できた（ローカルの miniflare。遠隔の D1 は未確認）。テストを実行時のエラーに差し替えることを勧める。
  - 報告の「分かったこと」の5と6（`wrangler.configPath` が無いと WASM を読めない、テストごとに D1 が初期化されない）は、どちらも再現した。前者は configPath を外すと `.wasm?module` の解析エラーになった。後者は、同じファイルの別のテストに行が残っていた。

### 4.2 ビルド・プレビュー

- `pnpm build`: 成功。`wrangler deploy --dry-run` の数字は次のとおりで、報告の数字と合う。
  - WASM: 3,227.15 KiB
  - server-build: 1,001.16 KiB
  - 合計: 4,404.09 KiB、gzip で 1,344.84 KiB

  上限についての記述は L11 ①を参照。
- `wrangler d1 migrations apply DB --local` と `seed-local.sql` を実行した後、`vite preview --port 4317` を起動した。
  - **SSR**: `GET /poc/izakayas` が 200 で、HTML に `<li>店A…` が含まれていた。
  - **タグの AND 検索**: `?tag=1&tag=2` では店A だけ、`?tag=1` では店A と店B、条件なしでは店A と店B が返った。
  - **Cron**: `curl /cdn-cgi/handler/scheduled?cron=0+3+*+*+*` が `ok` を返した。ログには `[scheduled] cron=0 3 * * *` が出て、`izakayas.id=10` の `coords_fetched_at` が更新された。ただし、設定に `triggers.crons` が無い（L11 ②）。
  - `Request.cf` の取得に失敗したというエラーは、ネットワーク制限によるもので、動作には影響しない。
  - プレビューは終了後に止めた。
- **楽観的更新**（Playwright と `/usr/bin/google-chrome`）
  - ハートが切り替わるまで **66ms**、サーバーの応答は 1,574ms。再読み込みした後も保たれていた。報告の「約 0.13 秒」とほぼ同じ。
  - JavaScript を無効にしても、送信で登録できた。
  - 3回連打すると、最終状態は3回の切り替えと一致した。ただし、サーバー側では3つの要求が並行して処理されるので、最終状態は処理の順序に左右されうる（推定）。

### 4.3 npm レジストリ（2026-11-14 時点）

| 確認事項 | 結果 |
| --- | --- |
| `@cloudflare/vitest-pool-workers` が非推奨になり、改名された | **正しい**。latest は 0.23.0。deprecated は「has been renamed to @cloudflare/vitest-plugin. This package will not receive future updates.」（modified 2026-10-07） |
| `@cloudflare/vitest-plugin@1.8.2` が Vitest 5 に対応 | **正しい**。peer は `vitest ^4.1.0 \|\| ^5.0.0`（1.5.0 以降。1.0.0 は ^4.1.0 のみ）。1.8.2 の公開は 2026-11-13T17:09Z |
| `remix-i18next` と `react-i18next` の衝突 | **正しい（ただし回避できる）**。`remix-i18next@8.0.0` の peer は `i18next ^24\|\|^25\|\|^26` と `react-router ^8`。`react-i18next@18.0.1` は `i18next >=27.0.1`。`react-i18next@17.0.1` 以降は `i18next >=26.0.1` なので、17 系と i18next 26 系を組み合わせれば衝突しない |
| `prisma` の latest が 8.0 RC | **正しい**。latest は 8.0.0-rc.33、next は 8.0.0-rc.10、prev は 7.10.1。`@prisma/client` の latest は 7.10.1 で、peer は `"prisma": "*"` |

### 4.4 報告の「分かったこと」「まだ検証していないもの」の評価

- 分かったこと
  - 1: 現構成には当てはまらない（L11 ④）。
  - 2・3・5・6: 正しい。
  - 4: 正しいが、空の結果を正常終了で返す点の注意が抜けている（L12）。
  - 7: 結論は妥当。ただし、それを示すテストが壊れている（M9）。
- まだ検証していないものに加えるべき項目
  - 環境ごとのビルドとデプロイ（H1）
  - 対話型トランザクションとネストした書き込み（M4）
  - 店名検索のエスケープ（M5）
  - `triggers.crons`
  - 遠隔の D1 での `batch()` の意味
  - 起動時間（ローカルの `wrangler check startup` では、profile window が 55.9ms で、実際の処理はほぼ0ms。Prisma の WASM は要求時に動的に読み込まれる）

---

## 5. 依頼4: 雛形の検証

### 5.1 CI と同じ順番での実行（fresh clone `/tmp/vrf/next-ci`）

| # | コマンド | 結果 |
| --- | --- | --- |
| 0 | `pnpm install --frozen-lockfile` | 成功（「Lockfile is up to date」、24.6s）。postinstall の `wrangler types` も成功 |
| 1 | `node scripts/check-prisma-versions.mjs` | 成功。3つとも `7.10.1` |
| 2 | `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true pnpm exec prisma generate` | 成功（Generated Prisma Client (7.10.1)）。生成後の `git status` は空。環境変数を付けないと、binaries.prisma.sh の 403 で失敗した（CLAUDE.md のとおり） |
| 3 | `scripts/check-migrations.sh` | `migrations OK`（`migrations/` は `.gitkeep` だけ） |
| 4 | `pnpm typecheck` | 成功（exit 0） |
| 5 | `pnpm test` | 1ファイル・1件成功（Vitest 5.1.0） |
| 6 | `pnpm build` | 成功（server-build 604KB／gzip 124KB）。ただし、出力は最上位の設定（H1） |

### 5.2 wrangler.jsonc

- **環境ごとに継承されない設定**: d1_databases は、staging と production の両方で再定義されている（正しい）。`CLOUDFLARE_ENV=production` でビルドした出力で、`compatibility_date`、`compatibility_flags: ["nodejs_compat"]`、`observability`、`upload_source_maps` が継承されることを確認した。
- **ローカルのダミーの ID**: ローカルの用途（テスト、`--local` の migrations、preview）では問題が無かった。staging と production の `TBD-*` は、P0 で置き換えるまで、CI の遠隔のマイグレーションで失敗する（想定どおり）。
- **Worker 名**: staging は `nishinari-next-staging`、production は `nishinari-next`、最上位も `nishinari-next` で衝突している（M8）。
- `workers_dev` と `preview_urls` は既定のまま（L14）。`triggers` は無い。

### 5.3 そのほか

- **版の固定**
  - package.json の22項目はすべて `^` も `~` も無い。pnpm-lock の specifier も同じ。
  - 計画の版の表と一致した。react-router と @react-router/dev は 8.5.1、react は 19.3.1（19.2.7 以上）、vite は 8.3.8、@cloudflare/vite-plugin と wrangler は 1.69.1 と 4.162.0、prisma 一式は 7.10.1、jose は 6.2.17、vitest と vitest-plugin は 5.1.0 と 1.8.2、pnpm は 10.28.0、@playwright/test は 1.65.0。
  - firebase 13.x はまだ入っていない（F3 で追加すればよい）。
  - TypeScript 5.9.3 は表に無い（npm の latest は 7.0.2）。表に追加することを勧める。
- **.gitignore**
  - `.wrangler`、`build/`、`.react-router/`、`worker-configuration.d.ts` は正しく無視されている。
  - `app/generated/` は追跡されたまま（M7）。
  - `.specify/feature.json` は、spec-kit が作る `.specify/.gitignore` で無視されている（正しい）。
- **spec-kit**
  - `/tmp/vrf/speckit-fresh` で `specify init --here --force --non-interactive --integration claude --script sh`（specify-cli v1.4.0）を実行し、比べた。`.specify/` と `.claude/skills/` は、manifest の時刻を除いて完全に一致した。
  - スキルは9種類ある。`init-options.json` の `speckit_version` は 1.4.0。
  - `SPECIFY_FEATURE_DIRECTORY` は `.specify/scripts/bash/common.sh:188-199` で使われている（CLAUDE.md のとおり）。
- **CLAUDE.md**
  - おおむね正しい。修正が必要な点は M4・L12・H1。
  - `migrate diff` の `--from-schema` と `--to-schema` は、7.10.1 の help にある。
- **秘密情報**: 両リポジトリの追跡ファイルと git の履歴を走査した。対象は、Google の API キー、GitHub のトークン、秘密鍵、`sk-` で始まる文字列など。該当は無かった。`.dev.vars` も無い。

---

## 6. 再現できたこと／裏取りできなかったこと

### 再現できたこと

- 雛形
  - fresh clone で、CI の6つの手順がすべて成功した。
  - `--frozen-lockfile` も成功した。
- H1: ビルドしてから `wrangler deploy --env staging` を実行すると、最上位の設定が使われる（dry-run）。`CLOUDFLARE_ENV` を付けてビルドすれば正しく切り替わり、食い違いも検出される。
- PoC
  - vitest は9件すべて成功した。
  - ビルドとバンドルサイズは報告の数字と一致した。
  - `vite preview` で、SSR、タグの AND 検索、Cron の起動と D1 の更新を確認した。
  - Playwright で、楽観的更新（66ms）と、JavaScript 無効時の動作を確認した。
  - 報告の「分かったこと」の5と6も再現した。
- 追加の検証
  - `batch()` は、実行時のエラーでも巻き戻る（3通り）。
  - 対話型 `$transaction` は例外になる。
  - ネストした create では、親の行が残る。
  - `contains` は `%` と `_` をエスケープしない。全角英字の大文字・小文字は区別される。
  - ローカルの D1 でテーブルを作り直すと、CASCADE では子の行が消え、RESTRICT では残る。
  - `migrate diff` に偽のエンジンを使うと、空の結果を正常終了で返す。
  - PoC の型テストは機能していない。
- 現行（模擬環境、Turbo 8.0.4 と現行と同じ CSS）
  - D-011、D-012
  - 名前を空にしたとき、422 のフラッシュが見えない
  - D-021（Chrome の DOM と DOMParser）、GA の script が遷移のたびに再実行される
  - お気に入りのダブルクリックで2回送信され、全体が再読み込みされる
  - D-019（ライトモードでヘッダーなどが白地に白）
  - フラッシュの4種類が同じ色（M2）
- npm レジストリの4項目（4.3）
- spec-kit を新しく初期化した結果と一致した
- npm 10.9.9 は、旧構成（`db5cb97`）で `edgesOut` のエラーになり、今の構成ではインストールできた

### 裏取りできなかったこと

- 現行の Rails アプリの実行（rubygems.org に届かない）。そのため、H2（ransack による推測）、M1（`POST /users` と `/login`）、D-010、D-013 のサーバー側、D-023、Google での取り消しの 500 は、ソースからの推定のまま。確かめるときは、本番ではなく手元の複製で行う。
- 模擬環境は、ERB から書き起こした HTML を使っている。Rails が実際に出す HTML（meta-tags の出力の細部など）との差は確認していない。
- 本番サイト・旧 DB（件数、`row_order` の NULL、パスワードユーザーの有無、DB のロケールと ILIKE の挙動）。
- 遠隔の D1 での `batch()` の原子性と、テーブル作り直しの挙動（ローカルの miniflare だけで確認した）。
- staging での CPU 時間と起動時間、遠隔へのマイグレーションとデプロイ（Cloudflare の API に届かない）。
- 新リポジトリの公開範囲と GitHub のプラン（M6 の承認の仕組みが使えるかは、これで決まる）。
- Google が body にある canonical を無視するという扱い（一般的な指針として書いた。文書は確認していない）。
- スマホのタッチ操作でのドラッグ＆ドロップ、Firebase、Places API（報告どおり、未検証の範囲）。

### 検証に使ったファイル（すべて `/tmp/vrf/` 配下。検証対象のファイルは変更していない）

- `next-ci/`: 雛形の fresh clone
- `poc/`: PoC の clone。追加したテストは実行後に削除した
- `legacy-css/out.css`: 現行の CSS の再ビルド
- `mock/server.mjs` と `pw/*.mjs`: Turbo の模擬環境と Playwright のスクリプト
- `fk/`: D1 でのテーブル作り直しの実験
- `speckit-fresh/`: spec-kit を新しく初期化した結果
- `rails/`、`ransack/`、`sorcery/`、`npm/`: 取得したライブラリのソース
