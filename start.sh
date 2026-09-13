#!/bin/sh
# Single-container startup: run MongoDB and the FastAPI app together.
#
# NOTE: /data/db lives on the container's local (ephemeral) disk unless a
# persistent Render Disk is mounted there — without one, all data resets on
# every redeploy or restart.
set -e

mkdir -p /data/db
mongod --dbpath /data/db --bind_ip 127.0.0.1 --port 27017 \
  --logpath /var/log/mongod.log --logappend &

# Wait for MongoDB to accept connections before starting the app.
for i in $(seq 1 60); do
  if mongosh --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

exec uvicorn server:app --host 0.0.0.0 --port "${PORT:-8000}"
