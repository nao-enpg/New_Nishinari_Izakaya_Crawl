# 西成泥酔旅行 TS版（nishinari-next）

現行の Rails 版（nao-enpg/Nishinari_Izakaya_Crawl）を、React Router v8 + Cloudflare Workers + D1 + Prisma で作り直すリポジトリ。
工程計画は `docs/plan.md`、現行仕様は `docs/legacy/`、現行との違いは `docs/deviations.md` を正とする。

## 技術スタック（版は package.json で完全固定。`^` を付けない）

- React Router 8.5（フレームワークモード、SSR）/ React 19.3 / Vite 8 / `@cloudflare/vite-plugin`
- Tailwind CSS v4 + shadcn/ui
- Cloudflare Workers（有料プラン）+ D1（`--location apac`）
- Prisma 7.10.1（`prisma-client` ジェネレータ、`runtime = "cloudflare"`、`@prisma/adapter-d1`）
- 認証: Firebase Authentication（Google ログインのみ）+ `jose` によるサーバー側検証 + 自前セッション（D1）
- テスト: Vitest 5.1（`@cloudflare/vitest-plugin` 1.8。旧名 `vitest-pool-workers` は非推奨）+ Playwright
- パッケージマネージャ: pnpm（`packageManager` で固定）

## 必ず守ること

- **Prisma でトランザクションを使わない**。D1 アダプターでは次のとおり原子性が無い。
  - 対話型 `$transaction(async tx => …)` は、実行前に例外になる。
  - 配列形式 `$transaction([...])` は、警告だけ出して1文ずつ実行する。途中で失敗しても前の更新は残る。
  - **ネストした書き込み**（親と子を一度に `create` するなど）も同じ。子の作成に失敗しても親の行が残る。
  - 原子性が必要な処理（並べ替え、削除、取り込み、親子の同時作成）は `env.DB.batch([...])` か1本の SQL で書く。
- **連鎖削除（`onDelete: Cascade`）を使わない**。子から親の順に `batch()` で削除する。D1 では外部キーの強制を止められず、テーブルの作り直しで子の行が消えるため。
- **D1 のマイグレーション**は `prisma migrate diff --from-schema <直前> --to-schema prisma/schema.prisma --script` で SQL を作り、`migrations/` に置いて `wrangler d1 migrations apply` で適用する。生成 SQL に親テーブルの `DROP TABLE` が含まれていたら手で直す。
- **データの取り込みは upsert のみ**。全削除して入れ直さない。
- **店名検索は LIKE のワイルドカード（`%` と `_`）をエスケープし、前後の空白を除く**（現行の ransack と同じ）。Prisma の `contains` はエスケープしない。
- `prisma` CLI の版は 7.10.1。npm の latest タグは 8.0 RC を指すので、`npx prisma` ではなく `pnpm exec prisma` を使う。
- Google Maps Platform の規約: 無期限に保存してよいのは place_id と自前データだけ。座標は30日以内に更新し、写真・住所・営業時間は保存もキャッシュもしない。
- 秘密情報を `VITE_` で始まる変数に入れない（ブラウザ向けバンドルに埋め込まれる）。
- 書き込みを伴う操作では、必ず所有者を確認する（現行のバグを再現しない）。
- 検索などのパラメータは、許可したものだけを読む（現行の ransack の全列検索のバグを再現しない）。
- 現行との違いを作るときは、`docs/deviations.md` に記録する。

## spec-kit（1.4.0）

- 機能ごとに `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-checklist` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement` → `/speckit-converge`（Converged まで）を回す。ロードマップは `ROADMAP.md`。
- 今どの機能を扱っているかは `.specify/feature.json`（git 管理外）で決まる。セッションをまたいだら、作業前に `export SPECIFY_FEATURE_DIRECTORY=specs/<機能のディレクトリ>` を設定する。
- チェックリストの `[x]` はレビュアー（Nao）が付ける。実装側で付けない。

## よく使うコマンド

```sh
pnpm install
pnpm dev                                  # ローカル開発（workerd 上で動く）
pnpm typecheck                            # app / workers / test / 設定ファイルを型チェック
pnpm test                                 # Vitest（Workers 上）
pnpm check:forbidden                      # $transaction と onDelete: Cascade の検出（ESLint を入れるまでの暫定）
pnpm exec wrangler d1 migrations apply DB --local
pnpm exec prisma generate
```

## デプロイ

- 通常は GitHub Actions が行う（main への push で staging、手動の dispatch で本番）。
- **環境はビルド時に `CLOUDFLARE_ENV` で決まる**。`wrangler deploy --env` だけでは切り替わらない。手で行うときは `pnpm deploy:staging` / `pnpm deploy:production` を使う。
- `wrangler.jsonc` の最上位（`nishinari-next-local`）はローカル専用。本番と同じ名前にしない。

## この作業環境（Claude のクラウドセッション）での注意

- `binaries.prisma.sh` に届かないため、`prisma generate` は `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true pnpm exec prisma generate` と、その場で付けて実行する。**この変数を export しない**。付けたまま `prisma migrate diff` を実行すると、何も出力せずに正常終了し、空のマイグレーションをコミットしてしまう。migrate diff は CI か手元の PC で実行する。
- `ui.shadcn.com` に届かないため、shadcn/ui の部品追加は CI か手元の PC で行う。
- 旧 DB（Koyeb の Postgres）にはここから接続できない。
