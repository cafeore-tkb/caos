#!/usr/bin/env bash
# supabase/migrations を使い捨てのデータベースに流し、supabase/tests/caos_test.sql で確かめる。
#
#   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres bash scripts/test-supabase.sh
#
# 指定した Postgres に caos_test_<時刻> というデータベースを作り、終わったら消す。
# 素の Postgres なら Supabase の代役（tests/stub_supabase.sql）を入れる。ローカルの Supabase（supabase start）なら
# TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres で、本物の auth・realtime を使う。
# 本番（POS と共有）には向けないこと。
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
admin_url="${TEST_DATABASE_URL:?TEST_DATABASE_URL に Postgres の接続先を入れてください}"
db="caos_test_$(date +%s)"
test_url="${admin_url%/*}/${db}"

has_realtime=$(psql "$admin_url" -XtAc "select exists (select 1 from pg_namespace where nspname = 'realtime')")
if [ "$has_realtime" = t ]; then
  # Supabase のデータベースはテンプレートから auth・realtime を引き継げないので、そのまま使い、最後に caos を消す
  test_url="$admin_url"
else
  psql "$admin_url" -Xq -c "create database ${db}"
fi
cleanup() {
  if [ "$has_realtime" = t ]; then
    psql "$test_url" -Xq -c "drop schema if exists caos cascade" 2>/dev/null || true
  else
    psql "$admin_url" -Xq -c "drop database if exists ${db} with (force)"
  fi
}
trap cleanup EXIT

run() {
  PGOPTIONS='--client-min-messages=warning' psql "$test_url" -Xq -v ON_ERROR_STOP=1 -f "$1" >/dev/null
}

[ "$has_realtime" = t ] || run "$repo_root/supabase/tests/stub_supabase.sql"
run "$repo_root/supabase/tests/pos_tables.sql"
for migration in "$repo_root"/supabase/migrations/*.sql; do
  run "$migration"
done
PGOPTIONS='--client-min-messages=notice' psql "$test_url" -Xq -v ON_ERROR_STOP=1 -f "$repo_root/supabase/tests/caos_test.sql" 2>&1 \
  | grep -E 'NOTICE:  ok:|FAILED|ERROR|all passed' | sed 's/^.*NOTICE:  //'
