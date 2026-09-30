#!/bin/sh
# Production entrypoint: apply pending migrations (never reset, never seed), then start the API.
# `prisma migrate deploy` is idempotent and takes an advisory lock, so restarts and replicas are safe.
# `exec` makes Node PID 1 so SIGTERM from the platform triggers the graceful shutdown hooks.
set -e
cd /app/apps/api
node_modules/.bin/prisma migrate deploy
cd /app
exec node apps/api/dist/main.js
