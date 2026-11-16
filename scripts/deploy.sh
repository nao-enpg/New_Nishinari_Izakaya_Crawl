#!/usr/bin/env bash
# staging か本番にデプロイする。GitHub Actions（Deploy staging / Deploy production）も、手元の PC もこのスクリプトを使う。
#
#   scripts/deploy.sh staging
#   scripts/deploy.sh production
#
# 手順（順番に意味がある）
#   1. CLOUDFLARE_ENV を付けてビルドする。環境はビルド時に決まり、wrangler deploy --env だけでは切り替わらない
#   2. D1 のマイグレーションを適用する（後方互換のものだけを置く約束。コードより先に当てる）
#   3. Worker をデプロイする。--env を付けておくと、ビルドした環境と食い違ったときに wrangler が止める
#
# 前提: pnpm install と prisma generate が済んでいること。
# 認証: CI では環境変数 CLOUDFLARE_API_TOKEN と CLOUDFLARE_ACCOUNT_ID。手元では wrangler login でもよい。
set -euo pipefail

target="${1:-}"
case "$target" in
  staging | production) ;;
  *)
    echo "使い方: $0 staging|production" >&2
    exit 2
    ;;
esac

sha="$(git rev-parse --short=12 HEAD)"
branch="$(git rev-parse --abbrev-ref HEAD)"

if [ "$target" = production ]; then
  # 本番は main からだけ（Actions の Deploy production も同じ確認をする。手元から出すときのため）
  if [ "$branch" != main ]; then
    echo "本番には main からだけデプロイする（今のブランチは ${branch}）" >&2
    exit 1
  fi
  # 本番は、コミット済みの内容だけを出す（手元の未コミットの変更を出さない）
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "本番には、コミットしていない変更がある状態ではデプロイしない" >&2
    exit 1
  fi
fi

echo "== ${target} に ${sha}（${branch}）をデプロイする"

echo "== 1/3 ビルド（CLOUDFLARE_ENV=${target}）"
CLOUDFLARE_ENV="$target" pnpm build

echo "== 2/3 D1 のマイグレーション"
pnpm exec wrangler d1 migrations apply DB --env "$target" --remote

echo "== 3/3 Worker のデプロイ"
pnpm exec wrangler deploy --env "$target" --tag "$sha" --message "${sha} (${branch})"

echo "== 完了: ${target} = ${sha}（${branch}）"
