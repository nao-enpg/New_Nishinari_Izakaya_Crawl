# 西成泥酔旅行 TS版（nishinari-next）

大阪・西成の居酒屋巡りサービス「西成泥酔旅行」を、TypeScript で作り直すリポジトリです。
現行の Rails 版は [nao-enpg/Nishinari_Izakaya_Crawl](https://github.com/nao-enpg/Nishinari_Izakaya_Crawl)。

- 工程計画: [docs/plan.md](docs/plan.md)
- 現行仕様台帳: [docs/legacy/](docs/legacy/README.md)
- 差分台帳（現行との違い）: [docs/deviations.md](docs/deviations.md)
- 開発のルール: [CLAUDE.md](CLAUDE.md)

## 構成

React Router v8（SSR）/ Cloudflare Workers + D1 / Prisma 7.10 / Tailwind v4 + shadcn/ui / Firebase Authentication

## 開発

```sh
pnpm install
pnpm exec prisma generate
pnpm exec wrangler d1 migrations apply DB --local
pnpm dev
```

テストと型チェック:

```sh
pnpm typecheck
pnpm test
```

デプロイは GitHub Actions の画面から手動で実行します（Deploy staging / Deploy production）。詳しくは CLAUDE.md の「デプロイ」を参照してください。
