#!/bin/sh
set -e

# Seed docs volume with sample files if empty
if [ -z "$(ls -A /app/docs 2>/dev/null)" ]; then
  echo "Docs volume is empty — seeding with sample documents..."
  cp -r /app/docs-sample/* /app/docs/ 2>/dev/null || true
fi

exec "$@"
