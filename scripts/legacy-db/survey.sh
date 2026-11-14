#!/usr/bin/env bash
# 旧 DB（Rails 版、Koyeb の PostgreSQL）を読み取り専用で調べ、集計値だけを出力する（工程計画 P1-4）。
#
# 使い方（Nao の PC、または GitHub Actions の legacy-db-survey ワークフロー）
#   LEGACY_DATABASE_URL='postgres://…' scripts/legacy-db/survey.sh
#
# - 接続文字列はコマンドラインに直接書かない（シェルの履歴に残るため）。環境変数で渡す。
# - SQL は READ ONLY のトランザクションの中で実行し、最後に ROLLBACK する（survey.sql）。
# - 出力に行の値（メールアドレス・名前・uid など）は含まれない。含める変更をしないこと（ログが公開されるため）。
set -euo pipefail

: "${LEGACY_DATABASE_URL:?LEGACY_DATABASE_URL に旧 DB の接続文字列を設定してください}"

# URL に sslmode が書かれていればそちらが優先される。Koyeb は TLS 必須
export PGSSLMODE="${PGSSLMODE:-require}"
export PGAPPNAME=legacy-db-survey
export PGCONNECT_TIMEOUT=15

exec psql "$LEGACY_DATABASE_URL" --no-psqlrc --quiet --set ON_ERROR_STOP=1 \
  --file "$(dirname "$0")/survey.sql"
