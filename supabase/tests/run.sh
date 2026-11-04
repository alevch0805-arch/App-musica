#!/usr/bin/env bash
# Prueba las migraciones en una base de datos Postgres vacía.
#   PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=himnos_test_$$
createdb "$DB"
trap 'dropdb "$DB"' EXIT
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
run -f tests/shim.sql
for f in migrations/*.sql; do run -f "$f"; done
run -f tests/pruebas.sql
