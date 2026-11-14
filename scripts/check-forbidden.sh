#!/usr/bin/env bash
# 本格的な lint（ESLint）を入れるまでの暫定の検査。D1 では原子性が無いため、次を禁止する。
#  - prisma.$transaction（対話型は例外、配列形式は原子性なしで1文ずつ実行される）
#  - onDelete: Cascade（D1 ではテーブルの作り直しで子の行が消える）
set -euo pipefail
status=0
if grep -rn --include='*.ts' --include='*.tsx' -E '\$transaction\s*\(' app workers 2>/dev/null | grep -v '^app/generated/'; then
  echo "::error::\$transaction は使わない。原子性が必要なら env.DB.batch() か1本の SQL で書く（CLAUDE.md）"; status=1
fi
if grep -n -E 'onDelete:\s*Cascade' prisma/schema.prisma 2>/dev/null; then
  echo "::error::onDelete: Cascade は使わない。子から親の順に batch() で削除する（CLAUDE.md）"; status=1
fi
[ $status -eq 0 ] && echo "forbidden patterns OK"
exit $status
