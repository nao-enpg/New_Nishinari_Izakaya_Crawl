# 西成泥酔旅行 TS版（nishinari-next）

現行の Rails 版（nao-enpg/Nishinari_Izakaya_Crawl）を、React Router v8 + Cloudflare Workers + D1 + Prisma で作り直すリポジトリ。
工程計画は `docs/plan.md`、現行仕様は `docs/legacy/`、現行との違いは `docs/deviations.md` を正とする。

## 技術スタック（版は package.json で完全固定。`^` を付けない）

- React Router 8.5（フレームワークモード、SSR）/ React 19.3 / Vite 8 / `@cloudflare/vite-plugin`
- Tailwind CSS v4 + shadcn/ui
- Cloudflare Workers（有料プラン）+ D1（`--location apac`）
- Prisma 7.10.1（`prisma-client` ジェネレータ、`runtime = "cloudflare"`、`@prisma/adapter-d1`）
- 認証: Firebase Authentication（Google ログインのみ）+ `jose` によるサーバー側検証 + 自前セッション（D1）
- テスト: Vitest 4.1（`@cloudflare/vitest-pool-workers`）+ Playwright
- パッケージマネージャ: pnpm（npm は vitest-pool-workers の peer 解決でクラッシュするため使わない）

## 必ず守ること

- **`prisma.$transaction` は使わない**。D1 アダプターではエラーにならないまま原子性が無い。原子性が必要な処理（並べ替え、削除、取り込み）は `env.DB.batch([...])` か1本の SQL で書く。
- **D1 のマイグレーション**は `prisma migrate diff --from-schema <直前> --to-schema prisma/schema.prisma --script` で SQL を作り、`migrations/` に置いて `wrangler d1 migrations apply` で適用する。生成 SQL に親テーブルの `DROP TABLE` が含まれていたら手で直す（D1 では外部キーを止められず、連鎖削除で子の行が消える）。
- **データの取り込みは upsert のみ**。全削除して入れ直さない。
- `prisma` CLI の版は 7.10.1。npm の latest タグは 8.0 RC を指すので、`npx prisma` ではなく `pnpm exec prisma` を使う。
- Google Maps Platform の規約: 無期限に保存してよいのは place_id と自前データだけ。座標は30日以内に更新し、写真・住所・営業時間は保存もキャッシュもしない。
- 秘密情報を `VITE_` で始まる変数に入れない（ブラウザ向けバンドルに埋め込まれる）。
- 書き込みを伴う操作では、必ず所有者を確認する（現行のバグを再現しない）。
- 現行との違いを作るときは、`docs/deviations.md` に記録する。

## spec-kit（1.4.0）

- 機能ごとに `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-checklist` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement` → `/speckit-converge`（Converged まで）を回す。ロードマップは `ROADMAP.md`。
- 今どの機能を扱っているかは `.specify/feature.json`（git 管理外）で決まる。セッションをまたいだら、作業前に `export SPECIFY_FEATURE_DIRECTORY=specs/<機能のディレクトリ>` を設定する。
- チェックリストの `[x]` はレビュアー（Nao）が付ける。実装側で付けない。

## よく使うコマンド

```sh
pnpm install
pnpm dev                                  # ローカル開発（workerd 上で動く）
pnpm typecheck
pnpm test                                 # Vitest（Workers 上）
pnpm exec wrangler d1 migrations apply DB --local
pnpm exec prisma generate
```

## この作業環境（Claude のクラウドセッション）での注意

- `binaries.prisma.sh` に届かないため、`prisma generate` は `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true` を付けて実行する。`prisma migrate diff` はここでは動かないので、CI か手元の PC で実行する。
- `ui.shadcn.com` に届かないため、shadcn/ui の部品追加は CI か手元の PC で行う。
- 旧 DB（Koyeb の Postgres）にはここから接続できない。
