#!/usr/bin/env bash
# survey.sql を合成データ（fixture.sql）に流し、期待値（survey.expected.txt）と比べる。
# 手元の PostgreSQL が必要。0節（版・ロケール・全角の扱い）は環境によって変わるので、1節以降だけを比べる。
#
#   TEST_DATABASE_URL='postgres://user:pass@localhost:5432/postgres' scripts/legacy-db/test-survey.sh
#
# 指定した接続先に legacy_survey_test というデータベースを作り、終わったら削除する。
set -euo pipefail

: "${TEST_DATABASE_URL:?TEST_DATABASE_URL に手元の PostgreSQL の接続文字列を設定してください（旧 DB を指定しないこと）}"
dir="$(dirname "$0")"
db=legacy_survey_test
test_url="${TEST_DATABASE_URL%/*}/$db"
export PGSSLMODE="${PGSSLMODE:-disable}"

psql "$TEST_DATABASE_URL" --no-psqlrc -q -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
trap 'psql "$TEST_DATABASE_URL" --no-psqlrc -q -c "DROP DATABASE IF EXISTS $db"' EXIT

psql "$test_url" --no-psqlrc -q -v ON_ERROR_STOP=1 -f "$dir/fixture.sql" >/dev/null
LEGACY_DATABASE_URL="$test_url" "$dir/survey.sh" | sed -n '/^## 1\./,$p' | diff -u "$dir/survey.expected.txt" -
echo "survey.sql OK"
