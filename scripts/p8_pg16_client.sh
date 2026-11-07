#!/usr/bin/env bash
# CI-only clients run in the exact PG16 service image, never runner PATH clients.
set -euo pipefail
: "${P8_PG_CONTAINER:?P8_PG_CONTAINER must identify the disposable CI service}"
tool="$(basename "$0")"
case "$tool" in
  psql|pg_dump|pg_restore) ;;
  *) echo "Invoke through a psql, pg_dump, or pg_restore symlink" >&2; exit 64 ;;
esac
exec docker exec -i "$P8_PG_CONTAINER" "$tool" "$@"
