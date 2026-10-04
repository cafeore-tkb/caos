#!/usr/bin/env bash
# supabase/migrations を使い捨ての Postgres に流し、supabase/tests で動きを確かめる。
#
#   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres bash scripts/test-supabase.sh
#
# 指定した Postgres に caos_test_<時刻> というデータベースを作り、終わったら消す。
# Supabase 本体（ログイン・Realtime）は使わず、必要なところだけ tests/00_setup.sql が代わりを用意する。
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
admin_url="${TEST_DATABASE_URL:?TEST_DATABASE_URL に Postgres の接続先を入れてください}"
db="caos_test_$(date +%s)"
test_url="${admin_url%/*}/${db}"

psql "$admin_url" -q -c "create database ${db}"
cleanup() {
  psql "$admin_url" -q -c "drop database if exists ${db} with (force)"
}
trap cleanup EXIT

run() {
  PGOPTIONS='--client-min-messages=warning' psql "$test_url" -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null
}

run "$repo_root/supabase/tests/00_setup.sql"
for migration in "$repo_root"/supabase/migrations/*.sql; do
  run "$migration"
done
psql "$test_url" -q -v ON_ERROR_STOP=1 -f "$repo_root/supabase/tests/10_drips.sql" 2>&1 | grep -E 'OK:|NG:|ERROR' | sed 's/^psql:[^ ]* NOTICE:  //'
