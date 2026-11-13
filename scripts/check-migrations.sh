#!/usr/bin/env bash
# D1 では外部キーの強制を止められないため、親テーブルの DROP TABLE は連鎖削除で子の行を消す。
# migrations/ の SQL に DROP TABLE が含まれていたら失敗させ、手で書き直すよう促す。
set -euo pipefail
if grep -n -i -E '^\s*DROP\s+TABLE' migrations/*.sql 2>/dev/null; then
  echo "::error::migrations に DROP TABLE が含まれています。D1 では連鎖削除で子の行が消えるため、手で書き直してください（CLAUDE.md 参照）。"
  exit 1
fi
echo "migrations OK"
