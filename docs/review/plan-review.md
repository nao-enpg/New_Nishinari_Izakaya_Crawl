# 「西成泥酔旅行 TS版リビルド 工程計画 v0.2」独立レビュー

- 調査日: 2026-11-14（JST）
- 対象: `/home/claude/nishinari-rebuild-plan.md`（以下「計画」）、現行コード `nao-enpg/nishinari_izakaya_crawl`（commit 29c5133、2024-10-18）
- 判定の凡例: **正しい** / **誤り** / **要修正**（大筋は合っているが、記述が不正確・不足） / **漏れ**（計画に書かれていない） / **未確認**（一次情報で裏取りできなかった） / **推定**（コードから推論したもので、実行して確かめてはいない）
- 調査方法と注意
  - npm と PyPI はレジストリを直接参照した。npm パッケージは `/tmp` に tarball を展開して中身を読んだだけで、実行はしていない。
  - spec-kit はローカルのクローンをデータとして読み、`git ls-remote` でタグを確認した。スクリプトやインタプリタは実行していない。
  - Rails 7.1.3.2 の挙動は、GitHub の該当タグのソース（raw.githubusercontent.com）で確認した。
  - `developers.google.com` は取得ツールが robots.txt で拒否された。そのため Google の料金表・Places のポリシー・データフィールドなどは、検索結果に出た Google 公式ミラー `developers.google.cn` の同じページで確認した。念のため、`.com` 側でも Nao さんが確認することを勧める。
  - 現行の本番サイト（nishinari-izakaya.net）は取得ツールの許可リスト外で、見られなかった。本番でしか確かめられない点は「未確認」とした。
  - 途中で依頼が追加された（認証を Firebase Authentication に変更）。そのため、Better Auth / arctic の比較は検証の対象から外し、第4章に「Firebase Auth」の節を加えた。

---

## 0. 要約（重大度「高」「中」）

| ID | 重大度 | 要旨 |
| --- | --- | --- |
| H1 | 高 | Prisma の D1 アダプターは、`$transaction([...])` も対話型トランザクションも**エラーにならずに原子性なしで実行する**。計画にある「一括実行で整合性を保つ」は成り立たない。原子性が要る処理は D1 の `batch()` か、1本の SQL で書く |
| H2 | 高 | 「URL は現行どおり」と「データを作り直す」が衝突している。`/izakayas/:id` と `/plans/:id` の数値 ID が振り直されるため、X で共有された古いリンクや検索結果が、別の店や他人の旅程表を指してしまう。タグ一覧・紹介文・表示順も、旧本番 DB か公開ページにしか存在しない |
| H3 | 高 | D1 のマイグレーションで、親テーブルを作り直すと `ON DELETE CASCADE` で子の行が消える。D1 では `foreign_keys=OFF` が効かず、Prisma はテーブル再定義の SQL を出す。また、`--from-local-d1` は Prisma 7 で削除済み。CSV の再投入で居酒屋を DELETE すると、お気に入りや旅程表の中身も連鎖して消える |
| H4 | 高 | Workers Free プランでは、CPU 10ms とサブリクエスト 50 件の上限があるため、SSR＋Prisma(WASM)、写真の一括取得、約100件を更新する Cron が成り立たない。有料プラン（月 $5）を前提にすべき。写真は5画面で使われていて、写真の取得口はそのまま課金の増幅口になる |
| H5 | 高 | 切り替えの手順書が不十分。OAuth のリダイレクト URI は**変わる**（現行は `/oauth/callback?provider=google`）。HSTS（2年、サブドメイン込み）があるので、証明書が先に用意できていないと即座に表示できなくなる。Workers のカスタムドメインは既存の CNAME を消さないと付けられない。ロールバックの具体的な手順もない |
| M1 | 中 | spec-kit の進め方。全機能の設計を先に終えるウォーターフォールではなく、機能ごとに specify→…→implement→converge を回すのが公式の流れ。converge は機能ごとに実装の直後に行う。今どの機能を扱っているかは git 管理外の `.specify/feature.json` で決まる。init には `--force`／`--non-interactive` が要る。「spec of specs が公式手順」は言い過ぎ |
| M2 | 中 | 「使われていないコード」の誤り。`user_sessions#destroy` はログアウトで**使われている**（`DELETE /logout`） |
| M3 | 中 | 現行のバグや挙動の見落としが多い（英語の削除確認が日本語になる、言語の切り替えが消える箇所が5か所、`?locale=xx` で 500、名前の2回目の編集で画面が壊れる〔推定〕、地図が一覧を開くたびに課金対象として読み込まれる、など。3.4節の表） |
| M4 | 中 | 現行を GitHub Actions で起動して基準を採取することはできる。ただし、本番モード特有の設定（`force_ssl`、`config.hosts`、`SECRET_KEY_BASE`）、ログイン回避の一時的な差し込み、ダミーデータ、GA への計測の遮断が必要になる |
| M5 | 中 | データ準備。テイクアウトの CSV には癖がある。照合は区の名前で絞るより、URL に含まれる CID で行うほうが確実。店名を Places の displayName から保存しないこと。座標を CSV や git に入れないこと。ID は固定して upsert すること |
| M6 | 中 | 版の組み合わせの罠。`prisma` は latest が 8.0 RC を指し、しかも `@prisma/client` 側の peer が `"*"` なので警告が出ない。Vitest 5 は `@cloudflare/vitest-pool-workers`（peer は vitest ^4.1）と組み合わせられない。Cloudflare のドキュメントとスターターテンプレートは v7 の書き方のままで、v8 では例外になる |
| M7 | 中 | セキュリティと個人情報。旧 DB はバックアップまで消すこと、削除はロールバック期限の後にすること、鍵とシークレットのローテーション、規約とプライバシーポリシーの更新（Google Maps の規約が要求している）、セキュリティヘッダーの同等性、staging を noindex にしてアクセスを制限すること、`VITE_` 変数がブラウザに出ること |
| M8 | 中 | Google の表示義務の細部。地図なしで Places のデータを出すときの Google ロゴ、背景画像として使っている写真の撮影者表示、写真の名前はキャッシュできないこと、Cloudflare のキャッシュに写真を置かないこと |
| M9 | 中 | CI/CD と運用。D1 マイグレーションとデプロイの順番、PR プレビューは D1 を共有してしまう／OAuth が使えない、Time Travel によるバックアップ、30日ルールを守るための監視 |
| M10 | 中 | 旧ユーザーへの告知が P8（切り替え当日）では遅い |
| FB-H1 | 高 | （Firebase）`/__/auth/*` のプロキシの実装要件。2026-10-15 以降に作ったプロジェクトは、既定の Hosting サイトが自動では作られない。サイト ID がプロジェクト ID と一致しない場合があるので、プロキシ先は実際の authDomain から取る。プロキシは 302 では駄目で、透過的に中継する |
| FB-H2 | 高 | （Firebase）OAuth クライアント・同意画面・承認済みドメインの設定漏れ。`https://<自ドメイン>/__/auth/handler` をリダイレクト URI に登録する。新しいプロジェクトでは `localhost` が既定で承認済みドメインに入らない。同意画面が「テスト」のままだと、テストユーザー以外はログインできない（未確認） |
| FB-M1 | 中 | （Firebase）ID トークン検証の抜け。公開鍵は X.509 形式で配られる。jose の `createRemoteJWKSet` は Cache-Control を見ない。`sub`・`iat`・`sign_in_provider` も確認する。セッションを作る口の CSRF 対策と、auth_time が直近かどうかの確認 |
| FB-M2 | 中 | （Firebase）匿名認証からの引き継ぎは、現行に無い機能の追加になる。Spark のままでは匿名アカウントが自動では削除されない。REST API から匿名アカウントを量産できる。認証の App Check は Identity Platform へのアップグレードが必要 |
| FB-M3 | 中 | （Firebase）React Router と Workers に組み込むときの注意。SDK はブラウザだけで読み込む。COOP ヘッダー。アプリ内ブラウザ（X や LINE）では Google ログインが拒否される |

---

## 1. 指摘（重大度順）

### 【高】H1. Prisma＋D1 の「トランザクション」は、エラーにならないまま原子性が無い

- **対象**: 計画 1章「技術的な制約」（対話型トランザクションが使えない）、P1-4c（`$transaction([...])` の一括実行か、1本の SQL か）、5章のリスク表（一括実行または1本の SQL で作る）
- **判定**: 要修正（重要）
- **根拠**
  - `@prisma/adapter-d1@7.10.1` のソース（`dist/index-workerd.mjs`）では、`startTransaction()` が警告を出すだけで、`commit()` と `rollback()` は何もしない。警告文は「Cloudflare D1 does not support transactions yet. When using Prisma's D1 adapter, implicit & explicit transactions will be ignored and run as individual queries, which breaks the guarantees of the ACID properties of transactions.」。つまり `$transaction([...])` も `$transaction(async tx => …)` も**例外にならず**、1文ずつ実行される。BEGIN も送られない（`usePhantomQuery: true`）。
  - Prisma 公式の D1 ページ https://www.prisma.io/docs/orm/overview/databases/cloudflare-d1 にも、「implicit & explicit transactions will be ignored and run as individual queries」とある。
  - 一方、D1 の Worker API https://developers.cloudflare.com/d1/worker-api/d1-database/ では、`batch()` について「Batched statements are SQL transactions」「aborts or rolls back the entire sequence」と書かれている。**原子的に動くのは D1 の `batch()` であって、Prisma の `$transaction` ではない**。情報源によって食い違うのは、この2つを混同しているためと考えられる。
  - 暗黙のトランザクションも同じ扱いになる。ネストした書き込みや、Prisma 側で外部キーをエミュレートする場合などが該当する。
  - 同じアダプターには、バインド変数の上限 `MAX_BIND_VALUES = 98` がある。
- **修正案**
  - 計画の「対話型トランザクションが使えない」を、「Prisma 経由のトランザクションはすべて原子性なしで、しかもエラーにならない」に書き換える。
  - 原子性が必要な処理（旅程表の並べ替え、旅程表の削除、ユーザー作成とそれに伴う処理）は、`env.DB.batch([...])` を直接使うか、1本の SQL（`UPDATE … SET position = CASE id WHEN … END`）にする。どちらを使うかをコーディング規約に入れる。
  - lint などで `prisma.$transaction` の使用を禁止する。
  - P1-4c の完了条件を「`env.DB.batch()` による並べ替えが、途中で失敗したときに巻き戻ることを、テストで再現できる」にする。

### 【高】H2. 数値 ID の URL 互換と、タグ・紹介文の出どころが決まっていない

- **対象**: 0章「忠実度（URL は現行どおり）」「データ（旧 DB は使わない）」、P2、P3-4 スキーマの方針
- **判定**: 漏れ
- **根拠**
  - 現行の URL は DB の連番 ID を使っている（`config/routes.rb:20,30` の `resources :izakayas` と `resources :plans`）。共有用のリンクも ID を含む。X 投稿用の文面は `plan_url(@plan)` で作られ、`?locale=` も付く（`app/views/plans/show.html.erb:13`）。
  - データを作り直すと、ID が1から振り直される。すると次のことが起きる。
    - 古い `/izakayas/57` が別の店を表示する。404 になるより悪い。
    - 古い公開の旅程表のリンク `/plans/3` が、新しいサイトの**他人の公開旅程表**を表示しうる。
  - 店の紹介文・Google マップの URL・タグとの対応付けは、リポジトリに無い。
    - `lib/assets/izakayas.csv` は見出しの `name` の4バイトだけ。
    - 取り込みスクリプト `lib/tasks/izakaya_import.rake:44-52` は、`description`、`url`、タグを設定しない。
    - つまり、現在の本番データは手作業で入れられたもので、旧本番 DB と公開ページにしか存在しない。
  - タグの表示順は ID 順（`app/controllers/izakayas_controller.rb:5`、`app/views/izakayas/index.html.erb:136`、`show.html.erb:6`）。一覧の並びも `order(id: :asc)`（`izakayas_controller.rb:44`）なので、「現行と同じ ID 順」は旧 ID が分からないと再現できない。
- **修正案**（どれを採るかは Nao さんの判断が必要）
  - **居酒屋の ID**: 公開ページから旧 ID・店名・タグ・紹介文を採取する。自分のサイトなので問題ない。CSV に `legacy_id` 列を持たせ、新しい ID を旧 ID と同じにするか、旧 ID から新 ID へ 301 で転送する。Google のデータに当たる住所・座標・写真の URL・営業時間は採取しない。
  - **旅程表の ID**: 新しい旅程表の連番は、旧 ID の最大値より十分大きい値から始める（SQLite なら `sqlite_sequence` を設定する）。または推測されにくい ID にする。旧 ID への GET は 404（または 410）と案内文を返す。
  - 「旧 DB から移行しない」という決定を、「**個人データ**は移行しない。Nao さん自身のコンテンツ（タグ・紹介文・旧 ID の対応）は公開ページから採取する」と言い直す選択肢を、Nao さんに示す。
  - CSV に `id`（固定）と `sort`（並び順）の列を必ず持たせる。並び順を ID に頼らない。

### 【高】H3. D1 のマイグレーションと連鎖削除で、本番データが音もなく消える

- **対象**: P3-4「外部キーは DB 側で連鎖削除する」、1章「マイグレーションは `prisma migrate diff`＋`wrangler d1`」（依頼文より）、P2・P7・P8 の seed 投入
- **判定**: 漏れ
- **根拠**
  - D1 のドキュメント https://developers.cloudflare.com/d1/sql-api/foreign-keys/ （2026-11-10 更新）では、外部キーの強制は既定で有効で、「user queries cannot change this during a query or migration」とある。`defer_foreign_keys` は検査を遅らせるだけ。
  - SQLite の仕様 https://www2.sqlite.org/foreignkeys.html では、DROP TABLE は「performs an implicit DELETE … may invoke foreign key actions」とされている。親テーブルを DROP すると、連鎖削除が動く。
  - Prisma 7.10.1 のスキーマエンジン（`build/schema_engine_bg.wasm` の文字列）には、`RedefineTables` と `PRAGMA defer_foreign_keys=ON / PRAGMA foreign_keys=OFF … PRAGMA foreign_keys=ON` のテンプレートが入っている。SQLite で列の型変更や NOT NULL 列の追加をすると、テーブルを作り直す SQL が出る。D1 では `foreign_keys=OFF` が効かないので、`izakayas` や `plans` を作り直すと `favorites` や `izakaya_plans` が消える。同じ現象の報告（二次情報、Drizzle の例）: https://brachkow-com.pages.dev/notes/d1-on-delete-cascade/
  - Prisma 7.10.1 の CLI では、`--from-local-d1` と `--to-local-d1` が**削除されている**。CLI ソースのエラー文は「`--from-local-d1` was removed. Please use `--[from/to]-config-datasource` …」。ところが Prisma の D1 ページ（v6 の題名のまま）は、まだこのフラグを案内している。v7 向けのガイド https://www.prisma.io/docs/guides/v7/deployment/cloudflare-d1 は、`--from-empty` か `--from-schema 旧スキーマ` と `--to-schema` の組み合わせを使う。
  - 計画の seed 投入は「CSV → D1」としか書かれていない。素直に「全削除して再投入」と実装すると、連鎖削除でユーザーのお気に入りや旅程表の中身が消える。
- **修正案**
  - マイグレーションの差分は `prisma migrate diff --from-schema <直前のスキーマ> --to-schema prisma/schema.prisma --script` で作り、`wrangler d1 migrations create/apply` で適用と履歴を管理する（`d1 execute` は使わない）。
  - 生成された SQL に、親テーブルの `DROP TABLE` が含まれていないかを CI で検査する。含まれていたら手で書き直し、子テーブルを先に切り離してから作り直す。
  - 本番に適用する前に、本番 D1 の export か Time Travel のブックマークの複製に対して適用を試し、行数を比べる。
  - 連鎖削除を DB に任せるのをやめ、アプリ側で `batch()` を使って子→親の順に削除する方式も比較する。
  - seed は「`place_id`（または固定の `id`）をキーにした upsert」に限る。消えた店は削除せず `hidden=true` にする。これを P2 と F2 の受け入れ条件にする。

### 【高】H4. Workers Free の上限と、写真の費用の見積もり範囲・悪用対策

- **対象**: 0章「Cloudflare Workers」、1章「表示時に API から取得するときの費用」、P1-5、P9 の Cron、5章のリスク表
- **判定**: 漏れ／要修正
- **根拠**
  - Workers の上限 https://developers.cloudflare.com/workers/platform/limits/ （2026-10-29 更新）は次のとおり。

    | 項目 | Free | 有料（Paid） |
    | --- | --- | --- |
    | HTTP リクエストあたりの CPU 時間 | 10 ms | 最大5分 |
    | Cron（1時間未満の間隔）の CPU 時間 | 10 ms | 30 秒 |
    | リクエストあたりのサブリクエスト | 50 | 10,000 |

    有料プランは月 $5 から（https://developers.cloudflare.com/workers/platform/pricing/ ）。
  - Prisma の workerd 向けクエリコンパイラは WASM で、sqlite 用の base64 版は small で約 2.2MB、fast で約 4.4MB（`@prisma/client@7.10.1/runtime`）。SSR と WASM の初期化が Free の 10ms に収まる見込みは低い（**推定**。P1 で実測が必要）。
  - Cron で約100店の座標を更新すると、100件以上のサブリクエストになり、Free の50件を確実に超える。
  - 写真を出しているのは一覧と詳細だけではない（現行コード）。
    - 居酒屋一覧（`izakayas/index.html.erb:133`）
    - 居酒屋詳細（`show.html.erb:4`）
    - 旅程表一覧（`plans/index.html.erb:13-14`）
    - 旅程表詳細の各カードの背景（`plans/show.html.erb:33`）
    - マイページのお気に入り・旅程表カードの背景（`favorites/_favorites.html.erb:2`、`plans/_plan.html.erb:2`）
  - 写真の名前はキャッシュできない（「You cannot cache a photo name. Also, the name can expire.」https://developers.google.cn/maps/documentation/places/web-service/place-photos?hl=en ）。そのため、1枚表示するたびに次の2回の呼び出しが要る。
    - Place Details（`photos` フィールドは Essentials IDs Only で無料）
    - Place Photos（Place Details Photos、$7/1,000、無料枠1,000）

    「100件なら約10回」という計算そのものは合っている。ただし対象画面が多く、クローラー（JavaScript を実行する Googlebot を含む）も数に入る。
  - 写真を Worker 経由で返す口は誰でも叩けるので、繰り返し呼ばれるとそのまま課金される。Google Cloud の予算アラートは通知するだけで止めない（「budget alerts … only notify」https://developers.google.cn/maps/billing-and-pricing/manage-costs ）。
- **修正案**
  - 0章に「Workers は有料プラン（月 $5）を前提とする」と書き、費用の試算に含める。P1-4a の完了条件に、CPU 時間の実測（p99）を入れる。
  - 写真の取得は、カードごとに遅延読み込みする別エンドポイントにする。loader の中でまとめて取得しない（サブリクエストの上限に当たるため）。そのエンドポイントには次の対策を入れる。
    - DB にある place_id だけを受け付ける
    - Cloudflare の Rate Limiting（またはレート制限バインディング）をかける
    - アプリ側で日次の件数を数え、上限を超えたら代替画像を返す
    - Bot にはプレースホルダーを返す
  - 費用試算の対象画面に、旅程表一覧・旅程表詳細・マイページを加える。
  - 代案として、Maps JavaScript API の Place クラスでブラウザから写真を取る方式（ブラウザ用キー、リファラー制限つき）も技術検証の候補に入れる。

### 【高】H5. 本番切り替えとロールバックの具体性が足りない（OAuth・HSTS・DNS）

- **対象**: P0「OAuth クライアントは既存のものを使い続け」、P8「OAuth のリダイレクト URI を確認する（同じドメインなので基本は同じまま）」「Workers のカスタムドメインに割り当てる」「Koyeb に戻す手順」
- **判定**: 誤り（リダイレクト URI）／漏れ（その他）
- **根拠**
  - 現行のコールバック URL は `https://nishinari-izakaya.net/oauth/callback?provider=google`（`config/settings/production.yml:2`）。新しい実装では、どの方式でもパスが変わる。Firebase の場合は `https://<authDomain>/__/auth/handler`（第4章）。「同じドメインなので同じまま」は誤り。
  - HSTS: `config.force_ssl = true`（`config/environments/production.rb:52`）。Rails 7.1 の既定は `max-age=63072000; includeSubDomains`（`actionpack/lib/action_dispatch/middleware/ssl.rb:55,60`）。来訪したことのあるブラウザは、2年間 HTTPS しか受け付けない。サブドメイン（staging など）も含む。証明書の発行が切り替えに間に合わないと、警告を飛ばして先へ進むこともできない。
  - Workers のカスタムドメイン https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ （2026-11-12 更新）では、前提が「active Cloudflare zone」で、「You cannot create a Custom Domain on a hostname with an existing CNAME DNS record」とある。作るときに証明書が発行される。apex と `www` は別扱い。
  - Koyeb では apex ドメインを直接設定できない（「Koyeb does not support directly setting apex domains for most DNS providers」https://www.koyeb.com/docs/run-and-scale/domains ）。つまり現行は CNAME のフラットニングかリダイレクトで運用している可能性が高い。DNS の管理先は P0 で必ず確定させる。
  - 旧ホスティングが Cloudflare for SaaS のカスタムホスト名を残していると、移行後も apex が旧ホストへ流れる事例がある（二次情報 https://hn.jakechampion.name/reader/https://blog.iodev.org/blog/cloudflare-saas-custom-hostname-conflict/ ）。Koyeb がこの仕組みを使っているかは**未確認**。
- **修正案**（P8 の手順書に入れる）
  1. 新しいリダイレクト URI を**事前に**登録する。ロールバックに備え、旧 URI も残しておく。
  2. DNS が Cloudflare 以外にある場合
     - 現在のレコード（MX、TXT〔Google サイト確認、SPF〕なども含む）をすべて複製する。
     - DNSSEC が有効なら、先に解除するか付け替える。
     - TTL を短くしてからネームサーバーを移す。
     - 移した後もしばらくは Koyeb を指したまま安定させる。
  3. 切り替えの方式を選ぶ（次のどちらか）
     - (a) カスタムドメイン: CNAME を消してから付ける。証明書の発行時間を staging のサブドメインで事前に測っておく。
     - (b) Workers ルート（`nishinari-izakaya.net/*`）: proxied のレコードを残したまま付け外しできるので、ロールバックが速い。
  4. ロールバックの条件・期限・手順
     - Koyeb 側でもカスタムドメインの登録と証明書を有効なまま保つ。
     - 新しいサイトで作られたデータは、ロールバックすると失われる。その旨を告知文に入れる。
  5. HSTS はサブドメインにも及ぶので、staging なども最初から HTTPS で運用する。
  6. `www` の扱い（現行は `config.hosts` に apex しか入っていない。`production.rb:91`）、Search Console、サイトマップを確認項目に入れる。

### 【中】M1. spec-kit の使い方（工程の順序・converge・現在の機能の管理・init）

- **対象**: 2章の工程表（P3「全機能の tasks が揃う」→ P4 → P5 → P6 converge）、P0 の `specify init`、1章「spec-kit 1.x の変更点」、P5「1機能=1ブランチ=1PR」
- **判定**: 要修正
- **根拠**（spec-kit 1.4.0 のドキュメント。ローカルのクローンで確認）
  - 標準の流れは機能ごとで、「Create a constitution once per project and repeat the remaining steps for each feature.」（`README.md:105-107`）。
  - spec of specs は「Pick the next roadmap entry whose dependencies are already `done`」と、依存先が**終わってから**次へ進む（`docs/how-to/spec-of-specs.md`）。全機能の tasks を先に揃える計画の順序は、これと合わない。
  - converge は「Run it only after `/speckit.implement` has run on the current `tasks.md`」。不足があれば tasks.md に追記するので、implement → converge を繰り返す（`docs/reference/agentic-sdd.md`）。計画では P6 に分かれていて、実装をやり直すことが書かれていない。
  - 今どの機能を扱っているかは「`.specify/feature.json` … **not** from the checked-out Git branch」で決まる（`docs/quickstart.md:25`）。このファイルは init が作る `.specify/.gitignore` で管理対象外になっている（`docs/overview/core.md:88`）。Claude Code のクラウドセッションや別の作業ツリーでは引き継がれない。
  - git 拡張は opt-in（`specify extension add git`）。入れると `before_specify` フックが**必須**で番号つきブランチを作る（`extensions/git/README.md`）。
  - 空でないディレクトリに init する場合は `--force` が要る。エージェントや CI から実行するなら `--non-interactive` を付ける（`docs/installation.md`、`specify init --here --force --non-interactive --integration claude`）。
  - 「spec of specs が大きな案件の公式手順」は言い過ぎ。公式には「Decomposition adds the most overhead … Use it **only when the lighter options there are insufficient**」とされている（`docs/how-to/spec-of-specs.md`）。ただし、今回のように複数の機能を作る案件でロードマップを作ること自体は妥当。
  - スキル形式（v0.5.0、2026-04-02）と `/speckit.converge`（v0.11.2、2026-06-18）は、どちらも 1.0（2026-08-21）より**前**から入っている（`CHANGELOG.md`）。「1.x の変更点」という書き方は不正確。
- **修正案**
  - 工程を「P3〜P6 を機能ごとに回す」形に組み直す。
    - F1 で specify → clarify → plan → checklist（Nao さんが `[x]` を付ける）→ tasks → analyze → implement → converge（Converged まで）→ PR → マージ、の順に進めてから F2 に移る。
    - F1 の plan（全体設計）は、F1 を実装して確かめてから固める。
  - 機能を切り替えるたびに、`SPECIFY_FEATURE_DIRECTORY` を設定するか `feature.json` を更新する。これを CLAUDE.md の手順に書く。
  - git 拡張を入れるなら、ブランチ名の規則（`001-…`）と「1機能=1PR」をそろえる。spec と実装を同じ PR にするか分けるかも決めておく。
  - init は `uv tool install specify-cli==1.4.0`（PyPI も公式）か `--from git+https://github.com/github/spec-kit.git@v1.4.0` で版を固定し、`specify init --here --force --non-interactive --integration claude --script sh` で実行する。
  - ロードマップは公式の推奨どおり、最上位の `ROADMAP.md` か `specs/<epic>/roadmap.md` に置く（計画の `specs/ROADMAP.md` はどちらにも当たらない）。

### 【中】M2. 「使われていないコード」に、使われているものが混ざっている

- **対象**: 1章「使われていないコード」の「メール/パスワード認証一式（users / sessions / user_sessions）」
- **判定**: 誤り（一部）
- **根拠**: ヘッダーのログアウトリンク `link_to t('header.logout'), logout_path, data: { turbo_method: :delete }`（`app/views/shared/_header.html.erb:10`）は、`DELETE /logout` → `UserSessionsController#destroy`（`config/routes.rb:14`、`app/controllers/user_sessions_controller.rb:16-20`）につながっている。`GET /login`（`user_sessions#new`）も、ログインしていないときの誘導先として使われている（壊れているが）。
- **修正案**: 「users / sessions と、user_sessions の new と create は移植しない。`DELETE /logout`（ログアウト）は移植対象で、URL 互換表に載せる。`/login` は新しい誘導先に置き換える（差分台帳に記録）」と書き直す。

### 【中】M3. 現行の挙動・バグの見落とし（台帳と差分台帳に追加すべき項目）

- **対象**: 1章「現行のバグ」、P1-1 現行仕様台帳
- **判定**: 漏れ（詳細は 3.4節の表）
- **修正案**: 3.4節の項目を、現行仕様台帳の初版と差分台帳 v0 に入れる。特に次の4点は、表示や費用に直接響く。
  - 英語のときに削除の確認ダイアログが日本語になる
  - 言語の指定が消える箇所がある
  - 地図の初期化で毎回課金される
  - ライトモードで白い文字が読めない

### 【中】M4. 現行 Rails を GitHub Actions で動かして基準を採取する方法

- **対象**: P1-3「ログイン後の画面は、現行コードを GitHub Actions 上で起動し…」、P6 の現行との比較
- **判定**: 要修正（実現はできるが、手順が足りない）
- **根拠と必要な対応**
  - **本番モードで動かす必要がある**。開発モードでは訳語のフォールバックが無く、エラーページも違う。本番の挙動は次の設定に依存している。
    - `config.i18n.fallbacks = true`（`production.rb:82`）
    - 存在しないテンプレート → 406（3.2節）
  - 本番モードで動かすときの障害と対処
    - `force_ssl`（`production.rb:52`）: HTTP では HTTPS へ転送され、セッション Cookie にも secure が付く。
    - `config.hosts << 'nishinari-izakaya.net'`（`production.rb:91`）: localhost は 403 になる。
    - 対処: ランナーの `/etc/hosts` で nishinari-izakaya.net を 127.0.0.1 に向け、自己署名の TLS 終端（Caddy など）を置き、Playwright は `ignoreHTTPSErrors` で接続する。または設定を一時的に書き換え、その差分を記録する。
  - その他の準備
    - `SECRET_KEY_BASE` を環境変数で渡す。credentials は使わない。
    - `database.yml` が `host: db` 固定なので、`DATABASE_URL` で上書きする。
    - Postgres をサービスコンテナで立てる。
    - `yarn build` と `build:css` を実行する。
    - Ruby 3.2.3 と Node 20.13.1 を用意する。
  - ログイン回避は、CI の中だけで初期化ファイルを差し込んで作る。例: `/__ci_login/:id` で `auto_login`。リポジトリにはコミットしない。
  - CSV が空なので、テストデータを作る必要がある。画像は `izakayas.image` に入っている URL を使っているので、ダミーの画像を用意する。
  - 外部への通信の扱い
    - GA（`G-9MPR30BKGN`、`application.html.erb:18-24`）は Playwright で遮断する。**本番のサイトを撮影する場合も同じ**で、遮断しないと本番の GA が汚れる。
    - Maps の JS は一覧を開くたびに地図を初期化するので、本番を撮影すると Nao さんの API キーに課金される。
    - Font Awesome のキットはドメイン制限によっては表示されない。
  - 本番のデータ（現行）と新しいデータ（テイクアウト）は中身が違う。比べるのは構造・文言・遷移・ステータスコードにする。店名や件数は比べない。
- **修正案**: 上の内容を P1-3 の手順と完了条件に入れる。「現行を CI で起動できる」こと自体を、P1 の最初の小さな成果物にする。

### 【中】M5. データ準備（テイクアウト CSV・照合・保存してよい項目）

- **対象**: P2-1〜4、0章「Google の規約」
- **判定**: 要修正
- **根拠**
  - テイクアウトの保存済みリストの形式（Google Data Portability の Saved スキーマ https://developers.google.cn/data-portability/schema-reference/save?hl=zh-cn ）
    - リストの説明があると「the first line of the CSV file, followed by a blank line」になる。つまり見出し行が1行目とは限らない。
    - 列は title / note / URL / tags / comment。現在の書き出しは `Title,Note,URL,Comment` で、古い書き出しには `Tags` がある（二次情報 https://github.com/PimpinPumpkin/Vela/pull/767 ）。
    - 店の URL は `/maps/place/<名前>/data=…!1s0x…:0x…` の形で、座標も place_id も含まない。含まれるのは Google 内部の feature id で、その後半が CID。ピンを落とした地点は `/maps/search/<緯度>,<経度>` の形になる（同 PR）。
  - 照合で「西成区・浪速区に絞る」と、新今宮周辺でも天王寺区・阿倍野区の店が落ちる可能性がある（現行の取り込みスクリプトも同じ条件、`izakaya_import.rake:24`）。
  - 店名について。Places の `displayName` は Places のコンテンツで、無期限に保存してよいのは place_id だけ（「You can therefore store place ID values indefinitely」https://developers.google.cn/maps/documentation/places/web-service/policies?authuser=4 ）。座標は30日まで（Service Specific Terms 14.3 https://cloud.google.com/maps-platform/terms/maps-service-terms 、2026-10-15 更新）。
- **修正案**
  - 取り込みスクリプトの仕様に、次を書く。
    - 先頭の説明行と空行を読み飛ばす
    - `Tags` 列と `Comment` 列の両方に対応する
    - ピンを落とした地点は確認リストに回す
  - 照合はまず CID で行う。Text Search の結果の `googleMapsUri`（`?cid=`）と、テイクアウトの URL から計算した CID を突き合わせる（**推定**。P1-4e で確認する）。区の名前による絞り込みは補助的な扱いにし、地域外の候補は確認リストに出す。
  - CSV の `name` は、Nao さんが確認・確定した自前の表記として持つ。API の `displayName` を自動で書き込まない。テイクアウトの `Title` を使ってよいかは、Nao さんの判断として記録する。
  - **座標・住所・営業時間・写真の参照は、CSV にも git の履歴にも入れない**。CI でこれらの列が無いことを検査する。
  - CSV に固定の `id`、`legacy_id`、`sort`、`hidden` の列を持たせる（H2・H3 と共通）。
  - Text Search のフィールドマスクに `googleMapsUri` を入れると Pro SKU（5,000件まで無料）になる。100〜200件なら無料枠に収まる。

### 【中】M6. 版の組み合わせの罠（固定する版の一覧が必要）

- **対象**: 0章「周辺ライブラリ」「Prisma 7.10 系に固定」、5章のリスク「依存ライブラリの版の取り違え」
- **判定**: 要修正
- **根拠**（npm レジストリ、2026-11-14 時点）
  - `prisma` の latest は 8.0.0-rc.33。`next` タグはそれより古い 8.0.0-rc.10 を指している。`@prisma/client` と `@prisma/adapter-d1` の latest は 7.10.1。
    - `npm i -D prisma` を版指定なしで実行すると RC が入る。
    - `@prisma/client@7.10.1` の peerDependencies は `"prisma": "*"` なので、**警告が出ない**。
    - Prisma 8 RC の engines は `^22.18 || ^24.11 || >=26`。
  - Vitest の latest は 5.1.0（5.0.0 は 2026-09-03）。一方、`@cloudflare/vitest-pool-workers@0.23.0`（latest）の peer は `vitest ^4.1.0`。workerd と D1 の上でテストを動かすなら、Vitest 5 は使えない。
  - 多言語化: `remix-i18next@8.0.0` の peer は `i18next ^24||^25||^26`。`react-i18next@18` の peer は `i18next >=27.0.1` で、両方を最新にすると衝突する。`react-i18next@17` の peer は `i18next >=26.2.0`。
  - Cloudflare の React Router ガイド https://developers.cloudflare.com/workers/frameworks/framework-guides/react-router （2026-11-12 更新）は、`requestHandler(request, { cloudflare: { env, ctx } })` と素のオブジェクトを渡す例を載せている。ところが React Router 8.5.1 の `lib/server-runtime/server.js:51-52` には、「Invalid `context` value provided to `handleRequest`. You must return an instance of `RouterContextProvider`…」で例外を投げる処理がある（v8 の変更履歴「getLoadContext functions … must return a RouterContextProvider」）。
    - Cloudflare の `react-router-starter-template` は、まだ `react-router 7.18.5` と `react 19.2.1` を使っている。v8 の最低要件は React 19.2.7 以上。
    - 一方、`create-cloudflare@2.74.11` のテンプレートは、`import { env } from "cloudflare:workers"` を使い、context を渡さない形にすでに直っている。
  - Better Auth 1.7.23 の peer は `prisma ^5||^6||^7` だった（Firebase に変更したため、参考情報として残す）。
- **修正案**
  - P0 で「版の組み合わせ表」を作り、`package.json` で完全に固定する（`^` を付けない）。Renovate などで自動更新する場合は、`prisma` の RC やメジャー更新を対象から外す。
  - CI で `prisma -v` と `@prisma/client` の版が一致することを確かめる。
  - テストは Vitest 4.1 系に固定する（workers プールを使う場合）。
  - 雛形は `npm create cloudflare@latest -- --framework=react-router`（C3）を起点にする。Cloudflare のガイドにある context の渡し方は使わない。

### 【中】M7. セキュリティと個人情報（旧 DB・鍵・規約・ヘッダー）

- **対象**: P9「旧 DB の個人データを削除」、P0 の鍵、P3-1 の constitution（セキュリティ）
- **判定**: 漏れ
- **根拠**
  - 旧 DB に入っている個人データは、`users.name` と `users.email`、`authentications.uid`（`db/schema.rb:17-25,85-93`）。
  - 現行の Maps キーは HTML に埋め込まれている（`izakayas/index.html.erb:123`）。同じ環境変数を取り込みスクリプトでもサーバー側から使っている（`izakaya_import.rake:7`）。
  - Google Maps Platform の利用規約（2025-01-30 版の 3.2.2(a)、https://cloud.google.com/archive/maps-platform/terms-20250130 ）は、アプリの利用規約に次の2点を書くことを求めている。
    - Google Maps の機能を含むことを知らせる
    - Google Maps/Google Earth 追加利用規約と Google プライバシーポリシーに従うこと

    現行の利用規約（`app/views/static_pages/terms.html.erb`）には、この記載が無い。現行版の規約本文は取得できず、**未確認**（第5章）。
  - プライバシーポリシーは、位置情報と GA に触れている（`privacy_policy.html.erb:12,41`）。一方、Cloudflare（海外の事業者）や Firebase（認証）には触れていない。
  - Rails が既定で付けているヘッダー（`actionpack/lib/action_dispatch/railtie.rb:31-38`）は、X-Frame-Options SAMEORIGIN、X-Content-Type-Options nosniff、Referrer-Policy strict-origin-when-cross-origin、それに HSTS。React Router は既定ではこれらを付けない。
- **修正案**
  - P9 の手順に次を入れる。
    - ロールバック期限を決めてから旧 DB を削除する
    - Koyeb（または DB を提供している事業者）のバックアップ、スナップショット、ブランチ、手元のコピーも消す
    - 削除した日付を記録する
  - 旧 Maps キーと旧 OAuth クライアント（あれば）は、ロールバック期限の後に削除する。
  - 規約とプライバシーポリシーの更新を、F1 の「意図的な追加」として差分台帳に載せ、Nao さんの承認を得る。追加する内容は、Google Maps の条項、Cloudflare と Firebase の利用、位置情報の扱い。
  - Worker の共通ヘッダーで、上のヘッダーを同じように付ける。HSTS は max-age を短くしない。
  - staging と PR プレビューには `X-Robots-Tag: noindex` を付け、Cloudflare Access で保護する。
  - サーバー用の秘密情報は `VITE_` で始まる名前にしない。その名前の変数はブラウザ向けのバンドルに埋め込まれる。
  - Workers Logs に緯度経度やメールアドレスを出さない。

### 【中】M8. Google の表示義務の細部

- **対象**: P3-1 constitution「Google ロゴや写真撮影者の表示」、5章のリスク
- **判定**: 要修正（具体化が必要）
- **根拠**（https://developers.google.cn/maps/documentation/places/web-service/policies?authuser=4 ）
  - 「When displaying Places API data without a Google Map, you must include the Google logo」。ロゴの高さは 16〜19dp、周囲の余白も決まっている。スペースが無いときは「Google Maps」の文字でもよい。
  - 「You must always credit the author when displaying photos」。サムネイルや一覧では、大きい写真の画面で撮影者を表示するなら省略できる。
  - 写真の撮影者表示（`authorAttributions`）は、画像を表示する場所に必ず出す（Place Photos のページ）。
  - 現行は写真を CSS の背景画像として出している画面が多い（H4 の5画面）。
  - 写真の名前はキャッシュ禁止（H4）。Google のコンテンツをサービスの外にキャッシュすることも禁止。
- **修正案**
  - 画面ごとに「Google ロゴの位置」と「撮影者表示の位置、または省略する根拠」を決めて表にし、checklist の項目にする。
  - 写真を中継する場合は、Cloudflare のキャッシュ（Cache API や Cache Rules）に置かない。`Cache-Control: private, no-store` を明示するか、Google の `photoUri` へ直接転送する。
  - 店の外部リンクは、保存してある URL や座標を使わず、Maps URLs の `query_place_id` と `destination_place_id` で作る。現行は `@izakaya.url` と緯度経度を使っている（`izakayas/show.html.erb:13-14`）。

### 【中】M9. CI/CD・プレビュー・運用の抜け

- **対象**: P0 Actions、P5「PR ごとに staging のプレビュー」、P9「監視」「定期ジョブ」
- **判定**: 漏れ
- **根拠**
  - Worker Previews（2026-09-22 発表 https://developers.cloudflare.com/changelog/post/2026-09-22-worker-previews/ ）では、D1・KV・R2 は自動では分けられない。別のリソースを割り当てる必要がある。従来のプレビュー URL は workers.dev 上だけで、ログも見られない（https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/ ）。
  - Google の OAuth はリダイレクト URI にワイルドカードを使えない（Firebase の承認済みドメインも同じ）。そのため、PR ごとに URL が変わるプレビューではログインできない。
  - D1 の Time Travel は、有料プランで30日、Free で7日。復元は「destructive operation」で、データを上書きする（https://developers.cloudflare.com/d1/reference/time-travel/ ）。
  - D1 の主ロケーションは、作成リクエストを出した場所の近くに決まる。`--location apac` で指定できる（https://developers.cloudflare.com/d1/configuration/data-location/ ）。GitHub Actions（米国のランナー）から作ると、北米に置かれうる。
  - Cron の変更は、反映に最大15分かかり、その間は実行されないことがある。ローカルでは `/cdn-cgi/local/scheduled` で試せる（https://developers.cloudflare.com/workers/configuration/cron-triggers/ ）。
  - Google Cloud のクォータを上限に設定すると、上限に達した時点で座標更新の Cron も止まり、30日ルールを破る恐れがある。
- **修正案**
  - デプロイの順番を「D1 マイグレーション（後方互換のもの）→ コードのデプロイ」にし、互換性を壊す変更は2回のリリースに分ける（expand/contract）。
  - API トークンの権限は、Workers と D1 だけにする。カスタムドメインの付け替えは手作業にする。
  - プレビューには専用の D1 を使い、ログインは開発用の擬似ログインにする。本番では無効化されていることをテストで確かめる。本当の Google ログインは、固定の staging ホストだけで確かめる。
  - D1 は `--location apac` を指定して作る。
  - 監視に次を加える。
    - 取得から25日を過ぎた座標があれば警告する
    - 30日を過ぎた座標は自動で消し、地図や近い10件から外す
    - Cron の失敗を通知する
    - Time Travel からの復元を一度試しておく
  - Cron で座標を更新するときの API の呼び出し数は、表示用の上限と分けて確保する。
  - 新しい CLI `cf` はオープンベータ（2026-09-28 発表 https://blog.cloudflare.com/cloudflare-cf-cli-launch/ ）。Wrangler は、ベータ終了から18か月は保守される。当面は wrangler を版固定で使い、動きを見守る。

### 【中】M10. 旧ユーザーへの告知の時期

- **対象**: P8「旧ユーザーへの告知」、4章「告知方法 P7」
- **判定**: 要修正
- **根拠**: 旅程表とお気に入りは引き継がない（0章）。ユーザーが控えを取る時間が要る。プライバシーポリシーの利用目的には「当社サービスの変更、提供中止、終了…をご連絡するため」とある（`privacy_policy.html.erb:23`）。
- **修正案**: P7 の前（遅くとも切り替えの2〜4週間前）に、旧サイトに告知バナーを出す。旧サイトはデプロイが必要。告知の文面と、旧データを削除する予定日を差分台帳と P9 にそろえて書く。

### 【低】L1〜L9

| ID | 対象 | 指摘と根拠 | 修正案 |
| --- | --- | --- | --- |
| L1 | 1章「旧 Places API は新しいプロジェクトでは使えない」 | 概ね正しい。現在の公式ページ（https://developers.google.cn/maps/legacy ）は、Places API に「Legacy Date: March 1, 2025」と記すのみ。書かれているのは「In most cases, keep legacy APIs disabled on new projects」と、一時的にフォームから有効化する手段。「新しいプロジェクトでは有効化できない」という文言は、二次情報の引用（https://community.hivepress.io/t/google-places-api-legacy-vs-new/15282 ）でしか確認できなかった | 「原則として新しいプロジェクトでは使わない（Legacy 扱い）」に書き換える |
| L2 | 地図 | `google.maps.Marker` は 2024-02-21（v3.56）から非推奨（https://developers.google.cn/maps/documentation/javascript/advanced-markers/migration?authuser=3 の題名）。代わりの AdvancedMarker には Map ID が要る | P0 で Map ID を作る。Maps JS は「地図を表示」を押したときに初めて読み込み、地図のインスタンスは使い回す |
| L3 | 静的ファイル | Workers の静的アセットは1ファイル 25MiB まで。`eyecatch.gif`（41.6MB、README 専用）と `top.jpg`（19.7MB、未使用）は移植しない。`top_small.jpg`（2.9MB）はトップと問い合わせの背景なので、軽くする | 移植しないアセットを台帳に記録し、残すものは最適化する |
| L4 | 店名検索 | 現行は Postgres の ILIKE、新しい構成は SQLite の LIKE（大文字小文字を区別しないのは ASCII だけ）。ransack の `name_cont` と完全には同じにならない | E2E テストに、英字の大文字小文字と、全角・半角の例を入れる |
| L5 | 並び順 | 旅程表一覧・マイページのお気に入りと旅程表に、並び順の指定が無い（`plans_controller.rb:6`、`profiles_controller.rb:21-22`） | clarify で決め、台帳に記録する |
| L6 | GA | GA4 は同じ測定 ID（`G-9MPR30BKGN`）を引き継ぐ。React Router のページ遷移で page_view が数えられるかを確認する | F1 の受け入れ条件に入れる |
| L7 | P0 | spec-kit の main ブランチは 1.4.1.dev0（未リリース）。使うのはリリースされた 1.4.0 | 版固定（M1） |
| L8 | 0章「Vite 8」 | 正しい（`@react-router/dev@8.5.1` の peer は vite ^7 または ^8。`@cloudflare/vite-plugin@1.69.1` の peer は vite ^6.1〜^8、wrangler ^4.160.0） | ― |
| L9 | P2-4 の CSV 検査 | 重複と存在しないタグに加え、place_id の形式、CID の重複、`legacy_id` の重複、禁止列（座標など）が無いことを検査する | 検査項目を追加する |

---

## 2. 依頼1: 事実の裏取り

### 2.1 spec-kit

| 項目 | 判定 | 根拠 |
| --- | --- | --- |
| 最新版は 1.4.0（2026-11-10） | **正しい** | PyPI の `specify-cli` は 1.4.0 が最新で、アップロードは 2026-11-10T21:27Z。GitHub のタグも v1.4.0 が最新（`git ls-remote`）。`CHANGELOG.md` は「[1.4.0] - 2026-11-10」。main ブランチは 1.4.1.dev0（未リリース） |
| コマンドがスキル形式（9種類） | **正しい** | Claude では `.claude/skills/speckit-<command>/SKILL.md` に入り、`/speckit-specify` のように呼ぶ（`docs/integrations/claude.md`）。コマンドの元になるテンプレートは analyze、checklist、clarify、constitution、converge、implement、plan、specify、tasks の9つ（`templates/commands/`）。公式の順序は constitution→specify→clarify→plan→checklist→tasks→analyze→implement→converge（`docs/reference/agentic-sdd.md`）。ただし、これらは 1.x で入ったものではない（M1） |
| `specify init --here --integration claude` | **要修正** | コマンド自体は正しい。空でないディレクトリには `--force`、エージェントの環境では `--non-interactive` が要る（`docs/installation.md`）。モデルが自動でスキルを呼ばないようにする `--integration-options="--no-model-invocation"` もある |
| git 拡張の扱い | **要修正（具体化）** | 既定では入らない。`specify extension add git` で入れる（`docs/overview/core.md:25`）。`before_specify` で番号つきブランチを作る処理は必須（optional ではない）。今どの機能を扱っているかはブランチではなく、git 管理外の `.specify/feature.json` で決まる（M1） |
| カスタムチェックリストの `[x]` はレビュアーが付ける | **正しい** | 「Custom checklists … are reviewer-owned … `[x]` means the reviewer determined …」（`docs/reference/agentic-sdd.md`）。implement は、チェックの無い項目が残っていると止まって確認を求める（`templates/commands/implement.md:56-87`）。`checklists/requirements.md`（specify と clarify が管理する組み込みのもの）は別扱い |
| spec of specs が推奨手順 | **要修正** | 4つの方法のうち最も手間がかかるもので、「only when the lighter options … are insufficient」とされている（`docs/how-to/spec-of-specs.md`、`complex-features.md`）。複数の機能を作るときにロードマップを持つこと自体は妥当 |
| インストール方法 | **補足** | 公式の配布経路は2つ。GitHub のソース（推奨。`uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z`）と PyPI（`uv tool install specify-cli`）。どちらも保守者が公開している（`docs/installation.md`「Spec Kit is distributed through two official channels」）。どちらでも版を固定する（`==1.4.0` または `@v1.4.0`）。必要なのは Python 3.11 以上と uv |

### 2.2 React Router v8・TanStack Start

| 項目 | 判定 | 根拠 |
| --- | --- | --- |
| リリース日 2026-06-17 | **正しい** | npm の `react-router@8.0.0` は 2026-06-17T19:19Z。公式ブログ https://remix.run/blog/react-router-v8 も 2026-06-17 |
| 最低要件 Node 22.22 以上、React 19.2.7 以上、Vite 7 以上 | **正しい** | 8.5.1 の engines は `node >=22.22.0`、peer は `react >=19.2.7`、`@react-router/dev` の peer は `vite ^7.0.0 \|\| ^8.0.0` |
| Vite 8 で動くか | **正しい** | 上記の peer で認められている。8.1.0 と 8.2.0 で Vite 8 向けの修正が入っている（`@react-router/dev` の CHANGELOG） |
| 開発用プロキシが廃止され、@cloudflare/vite-plugin に一本化 | **正しい** | 8.0.0 の変更履歴「Remove `@react-router/dev/vite/cloudflare` dev proxy export; use `@cloudflare/vite-plugin` instead」。wrangler@3 のサポートも終了。ただし M6 の context の扱いに注意 |
| Worker の入口に scheduled を同居できるか | **正しい（条件つき）** | 入口は `workers/app.ts` の default export（C3 のテンプレート）なので、`fetch` と並べて `scheduled` を置ける。Cloudflare のガイドは「direct access to `workers/app.ts`」として、Durable Objects と Workflows を例に挙げている。ローカルでは `/cdn-cgi/local/scheduled` で試せる。Free プランではサブリクエスト50件と CPU 10ms の制約がある（H4） |
| 最新版は 8.5.x | **正しい** | 8.5.1（2026-10-27） |
| TanStack Start 1.0 の安定版が 2026-10-13 | **正しい** | https://tanstack.com/blog/tanstack-start-1-0 （2026-10-13、「TanStack Start 1.0 is finally stable.」）。npm の latest は 1.169.5 |

### 2.3 Prisma

| 項目 | 判定 | 根拠 |
| --- | --- | --- |
| @prisma/client の最新は 7.10.1 | **正しい** | 2026-10-15 公開。`@prisma/adapter-d1` も 7.10.1 |
| CLI `prisma` の latest が 8.0.0-rc | **正しい** | latest は 8.0.0-rc.33（2026-11-06）。prev は 7.10.1、next は 8.0.0-rc.10 |
| 何も指定しないと RC が入るか | **正しい（さらに悪い）** | `@prisma/client` の peer が `"prisma": "*"` なので、版が食い違っても警告が出ない（M6） |
| D1 の手順（`prisma-client`、`runtime = "cloudflare"`、`@prisma/adapter-d1`、`migrate diff`＋`wrangler d1`） | **概ね正しい** | v7 のガイドは `provider = "prisma-client"`、`runtime = "cloudflare"`、`new PrismaD1(env.DB)`（https://www.prisma.io/docs/guides/v7/deployment/cloudflare-d1 ）。CLI が受け付ける runtime は nodejs、deno、bun、workerd、cloudflare、vercel-edge、edge-light で、cloudflare は workerd の別名。注意点として、`--from-local-d1` は v7 で削除済み（H3）。ガイドは `wrangler d1 execute` を使っているが、`d1 migrations` で履歴を管理するほうを推奨する |
| 対話型トランザクションが使えない | **要修正** | 使えないのではなく、**原子性なしで黙って実行される**（H1） |
| `$transaction([...])` が D1 で原子的に動くか | **誤り（動かない）** | アダプターのソースで、commit と rollback が何もしないことを確認した。原子的なのは D1 の `batch()` だけ（H1） |
| React Router v8＋Vite でバンドルするときの既知の問題 | **一部確認、一部未確認** | 確認できたもの: Cloudflare の例の context の渡し方が v8 では例外になる（M6）。Prisma の WASM は base64 で 2.2〜4.4MB（Workers の上限は 64MiB、非圧縮のみで数える、https://developers.cloudflare.com/workers/platform/limits/ ）。生成されたクライアントは `*.server.ts` からだけ読み込む必要がある。旧ジェネレータ（`prisma-client-js`）を Vite で使ったときの CJS 由来のエラー報告がある（https://www.answeroverflow.com/m/1442591106343899346 、二次情報）。新しいジェネレータを RR v8 で使ったときの具体的な不具合報告は見つからなかった（P1-4b で確認） |

### 2.4 Google Maps Platform

| 項目 | 判定 | 根拠 |
| --- | --- | --- |
| 無期限に保存してよいのは place_id だけ、緯度経度は最大30日 | **正しい** | Service Specific Terms の 14.3「may temporarily cache latitude and longitude values from the Places API for up to 30 consecutive calendar days」と、A.3（Google の ID のキャッシュ）。最終更新は 2026-10-15（https://cloud.google.com/maps-platform/terms/maps-service-terms ）。ポリシーのページには「store place ID values indefinitely」 |
| Legacy は 2025-03-01 以降、新しいプロジェクトでは使えない | **要修正（概ね正しい）** | L1 |
| Place Details Photos は1,000件無料、超えると $7/1,000 | **正しい** | 料金表（2026-11-11 更新） https://developers.google.cn/maps/billing-and-pricing/pricing?hl=en 。Usage and Billing では Enterprise の区分に入っている |
| Place Details Enterprise は1,000件無料、$20 | **正しい** | 同上（Enterprise＋Atmosphere は $25） |
| Essentials は10,000件無料 | **正しい** | 同上（$5/1,000）。Pro は5,000件無料で $17。Essentials IDs Only は無制限に無料 |
| 各フィールドの SKU | **回答** | `photos` は Place Details Essentials **IDs Only**（無料。写真の画像を取る Place Photos は別に Place Details Photos として課金）。`businessStatus` は **Pro**。`regularOpeningHours` と `currentOpeningHours` は **Enterprise**。`location` は Essentials（https://developers.google.cn/maps/documentation/places/web-service/place-details?authuser=1 ）。1回のリクエストは「billed at the highest SKU applicable」、つまり含まれるフィールドの中で最も高い SKU で課金される。そのため、営業時間と閉業を同時に取ると Enterprise 1件分になる |
| 写真の表示義務 | **正しい（具体化が必要）** | M8 |
| 100件なら約10回で無料枠を使い切る | **計算は妥当、範囲が不足** | 1,000 ÷ 100 = 10回。ただし写真は5画面で使われていて、クローラーも数に入る（H4） |

### 2.5 Google テイクアウト

| 項目 | 判定 | 根拠 |
| --- | --- | --- |
| 列が Title、Note、URL、Comment | **概ね正しい** | 公式のスキーマは title / note / URL / tags / comment。古い書き出しは `Tags` 列。リストの説明があると、先頭に説明行と空行が入る（M5） |
| URL に座標と place_id が含まれない | **概ね正しい** | 店の URL には CID（feature id）しかない。ただし、ピンを落とした地点の URL には `<緯度>,<経度>` が入る（二次情報） |

### 2.6 Better Auth（参考。Firebase への変更で対象外になった）

- 最新は 1.7.23（2026-11-13）。公式ドキュメントでは `database: env.DB`（D1 バインディングを直接渡す方式）が示されている。
- Prisma アダプター（`@better-auth/prisma-adapter@1.7.23`）は内部で `db.$transaction(fn)` を使っている。そのため、Prisma と D1 の組み合わせでは原子性が無くなる。
- Kysely の D1 方言は、対話型トランザクションを例外で拒否する（「D1 does not support interactive transactions. Use the D1 batch() API instead.」）。

---

## 3. 依頼2: 現行コードに関する主張の検証

### 3.1 計画の第1章の主張

| 主張 | 判定 | 根拠（ファイル:行） | 補足 |
| --- | --- | --- | --- |
| 居酒屋データの CSV が空 | **正しい** | `lib/assets/izakayas.csv`（4バイトの `name` だけで、改行も無い） | 取り込みスクリプトは紹介文・URL・タグを設定しない（`lib/tasks/izakaya_import.rake:44-52`）。しかも旧 API の Text Search に Find Place 用のパラメータ（`input`、`inputtype`）を渡している（`:15-22`）。現在の本番データは手作業で入れたものと考えられる（H2） |
| plans の edit / update / destroy に所有者の確認が無い | **正しい** | `app/controllers/plans_controller.rb:3,41-54,58-60`（`Plan.find(params[:id])` で探していて、`current_user.plans` に絞っていない） | 一覧と詳細のボタンは所有者にしか出ない（`plans/index.html.erb:23-26`）が、URL を直接たたけば操作できる |
| izakaya_plans の create / destroy / reorder に確認が無い | **正しい** | `app/controllers/izakaya_plans_controller.rb:5-13`（`plan_id` が自分の旅程表か確かめていない）、`:20-23,27-30`（`IzakayaPlan.find`） | 同じ店を同じ旅程表に何度でも入れられる（`db/schema.rb:36-44` に一意制約が無い） |
| 翻訳キーの誤りが2件 | **正しい（ほかにもある）** | ① `config/locales/activerecord/ja.yml:28` が `plofiles`（en.yml:28 は `profiles`）。`profiles_controller.rb:11-12,15` の `t('.success')` と `t('.danger')` は、日本語では「Translation missing」になる。② `plans_controller.rb:12` の `t('.plans.public_false')` は、遅延参照で `plans.show.plans.public_false` を探し、既定値の `plans.plans.public_false` も無いので、どちらの言語でも「Translation missing: ja.plans.show.plans.public_false」がフラッシュに出る（Rails 7.1 の `abstract_controller/translation.rb:15-22`）。正しくは `t('plans.public_false')`（`activerecord/ja.yml:20-21`） | ③ **見落とし**: `config/locales/views/en.yml:39-45` に `plans.index.confirm_delete` が無い（ja.yml:46 にはある）。本番は `i18n.fallbacks = true`（`production.rb:82`）なので、**英語の画面で削除の確認ダイアログが日本語の「削除しますか？」になる**（`plans/index.html.erb:25`） |
| プロフィール更新時、送り先の `#flash` が無い | **正しい** | `app/views/profiles/update.turbo_stream.erb:7` が `prepend 'flash'` を送るが、レイアウト（`application.html.erb:33-35`）とパーシャル（`shared/_flash_message.html.erb:1`）に `id="flash"` が無い | 追加のバグ（**推定**）: 同じファイルの `:1-5` が `replace 'profile'` と、空の `replace 'edit_profile'` で、Turbo Frame の要素そのものを消してしまう（`profiles/show.html.erb:2-5`）。そのため、同じ画面で2回目の名前編集をすると、フレームが見つからずページ全体が `/profile/edit` へ移動する。そこで送信すると、フォームも消えて空白の画面になる |
| 未ログインで要ログインのページを開くとエラー | **正しい（詳細）** | 3.2節 | ― |
| 使われていないコードの一覧 | **一部誤り** | 3.3節 | ― |
| タグの表示順 | **正しい（ID 順）** | 全タグの一覧は `izakayas_controller.rb:5,52`（`Tag.order(id: :asc)`）。店ごとのタグは `izakayas/index.html.erb:136` と `show.html.erb:6`（`sort_by(&:id)`） | 新しい ID では並びを再現できないので、`sort` 列が必要（H2） |
| `?locale=` による言語の切り替え | **正しい（バグあり）** | `application_controller.rb:7-9`（すべての URL に `locale` を付ける）、`:17-19`（`params[:locale] \|\| :ja`）、切り替えのリンクは `shared/_header.html.erb:5-6` と `_before_login_header.erb:5-6` | 3.4節の #2〜#4 |

### 3.2 「未ログインでのアクセス」で実際に起きること（本番モード）

1. `before_action :require_login` が、`set_locale` より**先に**動く（`application_controller.rb:2-3`）。Sorcery が `not_authenticated` を呼び、`redirect_to login_path` で **302 → `/login?locale=…`** を返す（`:13-15`）。locale は、そのリクエストではまだ設定されていない。
2. `GET /login` は `UserSessionsController#new` に届く（`routes.rb:12`）。`app/views/user_sessions/` は存在しない。
3. Rails 7.1 の `ImplicitRender#default_render` は、ブラウザからの GET で HTML を要求されたとき、`ActionController::MissingExactTemplate` を投げる（`implicit_render.rb` v7.1.3.2）。
4. `ExceptionWrapper` が、これを **406 Not Acceptable** に対応させる（`exception_wrapper.rb:18`）。
5. `PublicExceptions` は `public/406.html` を探すが、存在しないので `X-Cascade: pass` を返す（`public_exceptions.rb:51-60`）。`ShowExceptions#pass_response` が **406、本文0バイト** を返す（`show_exceptions.rb:73-76`）。
6. **結果**: 302 の後、406 で空白のページになる。Turbo の画面遷移でも同じ。
7. 影響する URL: `/profile`、`/profile/edit`、`/plans/new`、`/plans/:id/edit`、未ログインでの POST・PATCH・DELETE、`/sessions/new`。`/users/new` と `/login` は直接開いても 406。
8. 開発モードでは、テンプレートが無いことを示すデバッグ用のエラー画面になる。

### 3.3 「使われていないコード」の検証

| 計画の項目 | 判定 | 根拠 |
| --- | --- | --- |
| users / sessions / user_sessions | **一部誤り** | users（`users_controller.rb`、ビュー無し）と sessions（`sessions_controller.rb`、ビュー無しで、しかも要ログイン）は使われていない。**user_sessions#destroy はログアウトで使われている**（M2） |
| `izakayas#favorites` | **正しい（しかも壊れている）** | `izakayas_controller.rb:55-58` が存在しない `favorites_izakayas` を呼んでいる（正しくは `user.rb:8` の `favorite_izakayas`）。ビューも無く、ログインしていなければ `current_user` が nil。どの場合も 500 |
| React と MUI | **正しい** | `app/javascript/react.jsx` は import だけのファイル。esbuild の入口が `app/javascript/*.*` なのでビルドはされる（`package.json:22`）が、レイアウトが読み込むのは `application` だけ（`application.html.erb:10`）。`react-router-dom` と `build:custom`（`package.json:24`）も使われていない |
| ActionCable | **正しい** | `app/channels/application_cable/*` は空で、`turbo_stream_from` も使われていない |
| `map.js` | **正しい** | `console.log` だけで、どこからも import されていない |
| `modal` コントローラ | **正しい（補足あり）** | `controllers/index.js:7-8` で登録されているが、`data-controller="modal"` を使う箇所が無い。さらに `<head>` の中の `turbo_frame_tag 'modal'`（`application.html.erb:11`）も使われていない。これは HTML の構文解析の仕様上、`<head>` をそこで閉じてしまう。そのため、後に続く meta・OGP・favicon・各スクリプトは、DOM 上では `<body>` に入る（**推定**） |
| **追加: 使われていないもの** | 漏れ | jQuery の CDN（`application.html.erb:17`、使っている箇所が無い）。`plans#show` の `@izakayas` と `@izakaya_plan`（`plans_controller.rb:14-15`）。`izakayas#show` の `@tags`（`izakayas_controller.rb:52`）。gem の `geocoder`、`google_places`、`jbuilder`。列 `formatted_address`、`photo_reference`、`opening_hours`（保存されているが表示されない）。取り込みスクリプト。`top.jpg`。`izakayas.*.title` などの未使用の訳語。sortable の `handle-selector` 属性（`plans/show.html.erb:26`。コントローラ側で読んでいない）。Stimulus の `debug = true`（`controllers/application.js:6`）。`/up`（ヘルスチェック。Koyeb 専用） |

### 3.4 計画が見落としている現行の機能・挙動・バグ

| # | 内容 | 根拠 | 扱いの提案 |
| --- | --- | --- | --- |
| 1 | 英語の画面で、削除の確認ダイアログが日本語になる | 3.1節 ③ | バグとして修正し、差分台帳に記録 |
| 2 | 言語の指定（locale）が消える箇所: 名前検索（GET フォームではクエリ文字列が置き換わる、`izakayas/index.html.erb:5`）、近い10件（`:43`）、地図のマーカーのクリック（`:104` の `/izakayas/${id}`）、ヘッダーのサイト名（`_header.html.erb:4` と `_before_login_header.erb:4` の `href="/"`）、ログイン後の移動先（`oauths_controller.rb:12,16`）。言語を切り替えると検索条件も消える（`url_for(locale:)` がクエリを引き継がない） | 各行 | バグとして修正 |
| 3 | `?locale=fr` のような値を渡すと 500 になる（`I18n::InvalidLocale`。`config/application.rb:35-36` で ja と en だけを許可） | `application_controller.rb:18` | 修正（既定の言語にする、または 404） |
| 4 | すべての内部リンクに `?locale=ja` が付く。canonical と `og:url` が `request.original_url`（クエリを含む）で、hreflang は無い。`og:locale` は `ja_JP` に固定 | `application_controller.rb:7-9`、`application_helper.rb:10-18` | URL 互換表と SEO の項目に入れる |
| 5 | `<title>` が2つある（レイアウトの訳語と meta-tags の「西成泥酔旅行 \| 西成泥酔旅行」）。meta description と keywords は空 | `application.html.erb:4,12`、`application_helper.rb:4-9` | 台帳に記録 |
| 6 | 地図: Maps JS を `callback=initMap` で読み込むので、地図を開かなくても、一覧を開くたびに非表示の地図が初期化される（Dynamic Maps として課金される）。開くたびに新しい地図も作る。中心は (34.6492213, 135.5033723) で、ズームは16に固定 | `izakayas/index.html.erb:72-107,123` | 費用の改善として、差分台帳に「意図的な変更」として記録 |
| 7 | 地図のマーカーには、表示中の結果（検索、絞り込み、近い10件）がそのまま出る。`@izakayas.to_json` で、全列（住所や営業時間など）がページに埋め込まれる | `:94` | 新しい実装では必要な項目だけを渡す |
| 8 | 近い10件は、名前やタグの絞り込みを無視して全店から計算する。位置情報の許可が拒否されても何も起きない（エラー処理が無い）。緯度経度は GET のクエリでサーバーに送られる | `izakayas_controller.rb:20-42`、`index.html.erb:109-121` | 仕様として記録し、位置情報をログに残さない |
| 9 | 名前検索とタグの絞り込みは同時に使えない（それぞれのリンクやフォームが、もう一方の条件を引き継がない） | `index.html.erb:5-15,24` | 仕様として記録 |
| 10 | お気に入りのボタンは一覧にしか無い。詳細画面には、お気に入りも旅程表への追加も無い。旅程表への追加フォームは、自分の旅程表が1つ以上あるときだけ出る | `index.html.erb:142-153`、`show.html.erb` | 台帳に記録 |
| 11 | お気に入りを2回押す（2回の要求が届く）と、2回目は一意性の検証で `RecordInvalid` になり 422 の画面が出る（**推定**） | `user.rb:20-22`、`favorite.rb:5`、`schema.rb:27-34`（DB には一意制約が無い） | 修正（DB に一意制約を付けて、冪等にする） |
| 12 | 旅程表関連のフラッシュが日本語で直書きされている（英語の画面でも日本語）。お気に入り関連の 'Favorite not found' は英語で直書き | `izakaya_plans_controller.rb:9,11,17`、`favorites_controller.rb:23` | 訳語にする（差分台帳） |
| 13 | 利用規約とプライバシーポリシーは日本語だけで、英語の画面でも日本語が出る。エラーページ（404 / 422 / 500）は Rails 既定の英語の静的ページ | `static_pages/terms.html.erb`、`privacy_policy.html.erb`、`public/*.html` | 方針を決めて台帳に記録 |
| 14 | フッター（問い合わせ・規約・プライバシー・X での共有）は**トップページにしか無い** | `static_pages/top.html.erb:23` | 同じにするか直すかを決める |
| 15 | 問い合わせフォームは、Google フォームの `formResponse` に直接 POST していて、送信後は Google の画面に移る。項目 ID は `entry.1932653243`（メール）と `entry.1841024108`（本文）。`label for` と入力欄が対応していない | `contact.html.erb:4-11` | 送信先と項目 ID を台帳に記録する。CSP の `form-action` に注意 |
| 16 | `public/favicon.ico` と apple-touch-icon が0バイト（実際のアイコンはアセット側の `favicon.ico`）。`robots.txt` はコメントだけ（全許可）。サイトマップは無い | `public/` | 新しいサイトでは正しいアイコンを配信する |
| 17 | ライトモードで読めない: DaisyUI 4 の既定（light と dark を OS 設定で切り替える）を使っているのに、`text-white` を前提にした要素が多い（`plans/show.html.erb:2-3`、規約ページ、`profiles/edit.html.erb:4` の入力欄など）（**推定**） | `tailwind.config.js:15-17` | P1 のライト／ダークの撮影で確かめる |
| 18 | 旅程表一覧のカード画像は `plan.izakayas.first`。並べ替えの順（`row_order`）ではない。マイページで写真が無いと `url('izakaya')` という相対 URL を読みに行く | `plans/index.html.erb:13`、`plans/_plan.html.erb:2` | 台帳に記録 |
| 19 | 並べ替えの送信は失敗しても何も起きない（エラー処理が無い）。ハンドル指定が効いていないので、カード全体がつかめる | `sortable_controller.js:14-19` | 新しい実装では、楽観的更新が失敗したら元に戻す（P1-4f） |
| 20 | セッションはブラウザを閉じると終わる Cookie（有効期限なし）。ログイン後は常にトップへ移動する。新規登録のときだけ `reset_session` を呼んでいる | `oauths_controller.rb:12,30-33` | セッションの有効期間を差分台帳で決める |
| 21 | 旅程表名の必須チェックが無い（モデルに検証が無く、DB も NULL を許す）。作成画面の説明欄は1行の入力欄、編集画面は複数行 | `plan.rb`、`schema.rb:71`、`plans/new.html.erb:15`、`edit.html.erb:15` | clarify で決める（計画の4章にもある） |
| 22 | セキュリティヘッダーと HSTS（M7、H5） | `production.rb:52` | 同じにする |

---

## 4. Firebase Auth（追加依頼）

依頼された構成: ブラウザで Firebase JS SDK を使い Google でログインする。Workers では jose で ID トークンを検証し、自前の httpOnly セッションを D1 に保存する。`/__/auth/*` は firebaseapp.com へ中継するか、ポップアップを使う。Firebase は Spark プランのままで、Identity Platform にはアップグレードしない。

### 4.1 想定の裏取り

| 想定 | 判定 | 根拠 |
| --- | --- | --- |
| Firebase JS SDK 13.x | **正しい** | npm の `firebase` の latest は 13.3.0（2026-11-11）。13.0.0 は 2026-10-07 |
| jose で検証: RS256、kid は securetoken の公開鍵、aud はプロジェクト ID、iss は `https://securetoken.google.com/<projectId>`、exp と auth_time、鍵は max-age に従って更新 | **正しい（不足あり）** | 公式 https://firebase.google.com/docs/auth/admin/verify-id-tokens?hl=ja （2026-03-31 更新）の条件は、alg=RS256、kid は x509 メタデータの鍵、exp は未来、**iat は過去**、aud、iss、**sub は空でない文字列（uid）**、auth_time は過去。鍵の更新は「`Cache-Control` ヘッダーに含まれる `max-age` の値を使用して」と書かれている。足りない点は FB-M1 |
| firebase-admin を Workers で使わない | **妥当** | `firebase-admin@14.5.1` は engines が `node >=22` で、依存に `jsonwebtoken`、`jwks-rsa`、`google-auth-library` などを持つ。Workers に対応しているという公式の記述は見つからなかった。jose の作者は、Deno・CF Workers・Bun で動かない原因が `node:crypto` の再現不足（`jsonwebtoken` 由来）だと書いている（https://www.github.com/firebase/firebase-admin-node/discussions/2429 、2024-01-23。保守者の返答は無い）。nodejs_compat で実際に動くかは**未確認**（実行していない） |
| 自前の httpOnly セッションを D1 に保存、firebase_uid で行を作る | **妥当（条件つき）** | Firebase の Manage Session Cookies（https://firebase.google.com/docs/auth/admin/manage-cookies?hl=en ）は、auth_time が直近かの確認、CSRF 対策、クライアント側の状態を残さないこと（`Persistence.NONE`、成功したらクライアントでサインアウト）、`httpOnly` と `secure` を推奨している |
| 第三者ストレージ対策として `/__/auth/*` を透過的に中継し authDomain を自ドメインにする、またはポップアップ | **正しい** | https://firebase.google.com/docs/auth/web/redirect-best-practices （2026-11-12 更新）の選択肢2（ポップアップ）と3（プロキシ）。対象は Chrome M115 以降、Firefox 109 以降、Safari 16.1 以降。プロキシは「cannot be done via a 302 Redirect」。`https://<domain>/__/auth/handler` をリダイレクト URI に追加する必要がある |
| Spark のまま Identity Platform にしない（アップグレードすると Spark では1日3,000 DAU） | **正しい** | https://firebase.google.com/docs/auth/ （2026-11-12 更新）では、アップグレードは「optional upgrade」で、アップグレードすると「no-cost (Spark) plan projects will be limited to 3,000 daily active users」。表の「Old limit」（アップグレードしない場合）では、Social が **Unlimited**。上限のページ（https://firebase.google.com/docs/auth/limits 、2026-11-12 更新）でも、DAU の上限は「with Identity Platform」の行にしか無い |
| 新しいプロジェクトが自動で Identity Platform になっていないか | **未確認（自動適用の記述は無い）** | 公式は「optional upgrade」で、「open the Authentication Settings page」から手動でアップグレードすると書いている。新しいプロジェクトに自動で適用されるという記述は見つからなかった。作成後に、コンソールの Authentication の設定に「アップグレード」の表示が残っていることを確かめる手順を入れる |
| Spark のまま Google ログインに DAU の上限が無いか | **正しい（ほかの上限はある）** | 上の「Unlimited」による。ほかの上限: 新規アカウントは IP あたり 100件/時、トークン交換はプロジェクトあたり 18,000/分（limits のページ） |
| Maps 用の課金プロジェクトと分ける | **正しい** | 「linking a Cloud Billing account to your project will auto-upgrade your project to the Blaze pricing plan」。同じプロジェクトで Google Maps API を使うと自動で Blaze になる（https://firebase.google.com/docs/projects/billing/firebase-pricing-plans 、2026-11-12 更新） |
| Spark のメール上限（パスワード再設定 150通/日、メールリンク 5通/日） | **正しい** | limits のページ: アドレス確認 1,000、アドレス変更 1,000、パスワード再設定 150、メールリンクのログイン 5（いずれも Spark、1日あたり）。**今回は Google ログインだけなので関係しない**。メールの方式を足さない限り、気にしなくてよい |
| 新規アカウントは IP あたり 100件/時 | **正しい** | limits のページ「100 accounts/hour for each IP address」 |
| 匿名から Google へ `linkWithPopup` / `linkWithRedirect` で引き継ぐ | **API としては正しい（課題あり）** | https://firebase.google.com/docs/auth/web/account-linking 。資格情報がすでに別のアカウントに結び付いていると失敗し、「you must handle merging the accounts and associated data」とある。課題は FB-M2 |
| 承認済みドメイン | **補足（新しい事実）** | 新しいプロジェクトでは「Firebase Authentication no longer includes `localhost` as an authorized domain by default」（https://firebase.google.com/docs/auth/faq-and-troubleshooting 、2026-11-12 更新） |
| 既定の Hosting サイトと authDomain | **補足（新しい事実）** | 2026-10-15 以降に作ったプロジェクトでは、既定の Hosting サイトが自動では作られず、Authentication を有効にしたときなどに作られる。サイト ID はできるだけプロジェクト ID にするが、使われていれば**ランダムな5文字が付く**。既定のサイトは後から変更も削除もできない。authDomain の既定値は、このサイトの `*.firebaseapp.com`（https://firebase.google.com/docs/hosting/default-site ） |

### 4.2 指摘

#### 【高】FB-H1. `/__/auth/*` のプロキシを Workers で作るときの要件

- **判定**: 漏れ（実装の要件が書かれていない）
- **根拠**: 4.1節（redirect best practices、default-site）。Workers の `fetch` は既定でリダイレクトを自分でたどる。
- **修正案**（P1 の技術検証に入れる）
  1. 中継先は、プロジェクト ID から組み立てず、Firebase の Web アプリ設定に入っている**実際の authDomain**（`<siteId>.firebaseapp.com`）から取る。
  2. React Router より前に、`workers/app.ts` の `fetch` で `/__/auth/` を判定して中継する。GET と POST の本文、パス、クエリをそのまま渡す。
  3. `redirect: "manual"` にして、3xx をブラウザへそのまま返す。Worker がたどってしまうと透過にならない（**推定**）。
  4. Cloudflare のキャッシュに載せない。HTMLRewriter などで中身を書き換えない。アプリ共通のセキュリティヘッダー（CSP、`X-Frame-Options: DENY`、COOP）を中継した応答に上書きしない。`/__/auth/iframe` はアプリの画面に埋め込まれるので、上書きすると動かなくなる。
  5. ブラウザが送ってくる自ドメインの Cookie（自前のセッション Cookie を含む）を、Google 側へ転送しない。`Cookie` ヘッダーを外す（**推定**。動作検証が必要）。
  6. 選択肢4（自前で配信する方式）では、`/__/firebase/init.json` も自ドメインで返す必要がある。選択肢3では要るかどうかが文書に無いので、技術検証で確かめる。
  7. 開発（localhost）、staging、本番のそれぞれで authDomain を分けるかを決める。

#### 【高】FB-H2. OAuth クライアント・同意画面・承認済みドメインの設定

- **判定**: 漏れ（計画の P0 にある「既存の OAuth クライアントを使い続ける」は使えなくなる）
- **根拠**
  - プロキシを使うなら、`https://<app domain>/__/auth/handler` を OAuth の承認済みリダイレクト URI に追加する必要がある（redirect best practices）。
  - 手動で作った Web クライアントには、`https://PROJECT_ID.firebaseapp.com/__/auth/handler` と `.web.app` を登録する（FAQ）。
  - 新しいプロジェクトでは、`localhost` が承認済みドメインに入らない（FAQ）。
  - Firebase の Google ログインで使う OAuth クライアントは、Firebase プロジェクト（Spark）側のものになる。現行の Rails 用クライアント（Maps と同じプロジェクトにあると考えられる）は使わない。
- **修正案**（P0 と P8 の手順）
  1. Firebase プロジェクトの OAuth クライアントに、リダイレクト URI を登録する。
     - `https://nishinari-izakaya.net/__/auth/handler`
     - staging のホストの `/__/auth/handler`
     - `http://localhost:<port>/__/auth/handler`（開発用）
  2. 承認済みドメインに、`nishinari-izakaya.net`、staging のホスト、`localhost` を追加する。PR プレビューの URL は登録できない（ワイルドカード不可。M9）。
  3. 同意画面（Google Auth Platform）を整える。
     - アプリ名「西成泥酔旅行」、サポートのメール、承認済みドメイン、プライバシーポリシーと利用規約の URL を設定する。
     - **公開ステータスが「本番」になっていること**を確認する。「テスト」のままだと、登録したテストユーザーしかログインできない（Google Auth Platform の仕様。今回の調査では一次情報を取れず、**未確認**）。
  4. 現行の Rails 用 OAuth クライアントは、ロールバック期限まで残し、その後削除する。
  5. ログインの経路が、サーバー側の `/oauth/google` と `/oauth/callback` から、ブラウザの SDK に変わる。この URL の変更を差分台帳に記録する（ヘッダーの「Googleログイン」は現在 GET のリンク。`_before_login_header.erb:9-12`、`plans/index.html.erb:5`）。

#### 【中】FB-M1. ID トークン検証とセッションの作成で抜けている点

- **判定**: 要修正
- **根拠**
  - 公式の検証条件には iat と sub も含まれる（4.1節）。
  - 公開鍵の URL は **X.509（PEM）形式**。jose では `importX509(pem, "RS256")` で読み込む。
  - jose の `createRemoteJWKSet` は JWKS 用で、キャッシュの有効期間は `cacheMaxAge`（既定10分）で決まり、Cache-Control は見ない（`jose@6.2.17` の `dist/types/jwks/remote.d.ts:36-44`）。
  - jose の `jwtVerify` は既定で exp を検査するが、`auth_time` と `sub` は検査しない。
  - Manage Session Cookies は、auth_time による「直近にログインしたか」の確認と、CSRF 対策を推奨している。
  - 匿名のトークンは REST API からも発行できる（https://firebase.blog/posts/2023/07/best-practices-for-anonymous-authentication/ ）。
- **修正案**
  - 検証の関数で、次をすべて自前で確認する。
    - `alg === "RS256"`
    - kid に対応する X.509 の鍵
    - `aud` と `iss`
    - `exp`、`iat`、`auth_time`（許容するずれは数秒）
    - `sub` が空でないこと
    - `firebase.sign_in_provider === "google.com"`（匿名や想定外の方式を拒否する）
  - 鍵は、Cache-Control の max-age の間だけ isolate のメモリに持つ。必要に応じて Cache API にも置く。
  - セッションを作る口（例: `POST /session`）では次を行う。
    - Origin を検査し、CSRF トークンを確認する
    - `auth_time` が5分以内であることを求める
    - 成功したらクライアントで `signOut()` を呼ぶ
    - 持続性を `inMemoryPersistence` にするか検討する。リダイレクト方式で `getRedirectResult` が使えるかは**技術検証が必要**
  - セッションの ID は推測できない値にし、D1 にはハッシュを保存する。有効期限、ログアウト（`DELETE /logout`、M2）での破棄、同時に何個まで許すかを決める。
  - サードパーティのライブラリで検証すると、トークンの取り消しやアカウントの無効化は分からない。セッションの有効期間を短めにするか、管理の運用で補う。
  - ユーザー行は `firebase_uid` を一意キーにして作る。初回ログインのときに名前（`name`）を入れる。メールアドレスを保存するかは、必要最小限の観点で決める（現行は保存している）。

#### 【中】FB-M2. 匿名認証と、Google アカウントへの引き継ぎ

- **判定**: 要修正（機能の追加になり、運用上の課題がある）
- **根拠**
  - 現行には匿名で使える機能が無い。旅程表もお気に入りも Google ログインが必要（`plans_controller.rb:2`、`favorites_controller.rb`）。0章の「機能は現行どおり」と合わない。
  - 匿名アカウントの自動削除は、Identity Platform へのアップグレードが必要（firebase.blog 2023-07-13）。Spark のままでは溜まり続ける。
  - 引き継ぎで資格情報が重なると、手作業でのマージが必要になる（account-linking）。
  - Auth の App Check も Identity Platform が必要（FAQ）。匿名アカウントは REST から量産でき、IP あたり 100件/時の上限にも数えられる。
- **修正案**: 匿名認証は入れないことを勧める。入れる場合は、次をすべて決める。
  - 差分台帳に「意図的な追加」として記録する
  - D1 側の匿名ユーザーと、その旅程表を定期的に削除する
  - 重なったときのマージ規則（旅程表とお気に入りをどちらへ移すか）
  - 匿名ユーザーの作成にレート制限をかける

#### 【中】FB-M3. React Router と Workers に組み込むときの注意

- **判定**: 漏れ
- **根拠と修正案**
  - Firebase の SDK はブラウザ専用のコードとして読み込む。`*.client.ts` に置くか、`useEffect` の中で動的に import する。SSR のバンドルに入れないためで、トップページなどログインに関係ない画面の JS も軽くできる（**推定**）。
  - ポップアップを使う場合、`Cross-Origin-Opener-Policy: same-origin` を付けると、ポップアップとの連携が切れる。`same-origin-allow-popups` にするか、付けない（**推定**。Web の仕様による）。ポップアップはスマホでブロックされやすいと公式も書いている（redirect best practices）。
  - X、LINE、Instagram などのアプリ内ブラウザでは、Google の OAuth が拒否される（`disallowed_useragent`。https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html ）。現行も同じだが、X での共有から来る人が多いと考えられるので、「外部ブラウザで開いてください」という案内を検討する。
  - staging と本番で Firebase プロジェクトを分けるかを決める。同じプロジェクトにすると、ID トークンの aud が同じになる。

#### 【低】FB-L

- Firebase の Web API キーは秘密にしなくてよい（「API keys for Firebase services are OK to include in code」https://firebase.google.com/docs/projects/api-keys?hl=en ）。ただし API の種類を制限することが推奨されている。
- HTTP リファラーで制限する場合は、authDomain（自ドメイン）と `*.firebaseapp.com` を含めないとログインが失敗する可能性がある（**推定**）。
- Spark では、無料枠を超えた製品はその月の残りの期間止まる（pricing plans のページ）。ソーシャルログインの上限は無いので、今回は影響が小さい。
- 計画の P1-4d（Better Auth と arctic の比較）は、「Firebase＋jose＋プロキシ＋D1 セッション」の技術検証に置き換える。4章の未決事項（認証の実装方式）も更新する。

---

## 5. 裏取りできなかった項目

| 項目 | 理由・残っていること |
| --- | --- |
| 現行本番サイト（nishinari-izakaya.net）の実際の表示（タグの一覧、件数、画像が切れていないか、OGP が効いているか、ライトモードで読めるか、`www` が使えるか） | 取得ツールの許可リスト外で見られなかった。P1 で Nao さんの環境から Playwright で確認する |
| nishinari-izakaya.net の DNS の管理先、DNSSEC、MX と TXT レコード | サンドボックスから DNS を引けなかった |
| Koyeb のカスタムドメインが Cloudflare for SaaS を使っているか（切り替え後に apex が旧ホストへ流れる恐れ） | Koyeb の公開ドキュメントに記述が無かった |
| 現行版の Google Maps Platform 利用規約の、エンドユーザー規約に関する条項 | 現行版のページは取得できず、2025-01-30 のアーカイブ版で確認した |
| Places API (Legacy) が「新しいプロジェクトでは有効化できない」という明文 | 現在の公式ページには推奨としてしか書かれておらず、明文は二次情報だけ |
| Google のポリシー・料金・データフィールドの各ページ（developers.google.com） | robots.txt で取得を拒否されたため、公式ミラーの developers.google.cn で確認した。`.com` 側での最終確認を勧める |
| SSR＋Prisma(WASM) が Workers Free の CPU 10ms に収まるか | 推定のみで、実測していない（P1 で測る） |
| Prisma の `prisma-client` ジェネレータ（runtime=cloudflare）を React Router v8＋Vite 8 でバンドルしたときの具体的な不具合 | 公開されている報告が見つからなかった（P1-4b） |
| テイクアウトの CID と Places (New) の `googleMapsUri` の cid を突き合わせられるか | 推定。実際の API の応答で確認する必要がある |
| 名前の2回目の編集で画面が壊れる不具合、`<head>` の中の turbo-frame によって meta が body に移ること、お気に入りの二重送信で 422 になること、ライトモードで白い文字が読めないこと | コードと仕様からの推定で、実際には動かしていない |
| Firebase: 新しいプロジェクトが自動で Identity Platform になっていないこと | 「optional upgrade」という記述しか無い。プロジェクトを作った後にコンソールで確認する |
| Firebase: `firebase-admin` が nodejs_compat の上で動くか | 実行していない。公式に対応していないことと、動かないという報告しか無い |
| Firebase: プロキシ方式で `/__/firebase/init.json` を中継する必要があるか。Cookie を外して問題ないか。`redirect: "manual"` の要否 | 公式文書に記述が無い（技術検証の項目） |
| Firebase: `inMemoryPersistence` とリダイレクト方式を組み合わせて動くか | 未検証 |
| Google Auth Platform: 同意画面が「テスト」のときに、テストユーザー以外がログインできないことの一次情報 | 今回は一次情報を取れなかった |
| Firebase の Web API キーにリファラー制限をかけたとき、authDomain を含める必要があるか | 公式文書に記述が無かった |
