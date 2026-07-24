#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  npm run db:migrate
fi

if [ "${RUN_DEMO_SEED:-true}" = "true" ]; then
  npm run db:seed:demo
fi

exec npm run start
