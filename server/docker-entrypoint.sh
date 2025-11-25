#!/bin/bash
set -e

# start PostgreSQL in the background
echo "Starting PostgreSQL..."
sudo -u postgres /usr/lib/postgresql/18/bin/postgres -D "$PGDATA" &

# wait until Postgres is ready
until sudo -u postgres /usr/lib/postgresql/18/bin/pg_isready -q; do
  sleep 0.2
done
echo "PostgreSQL is ready."

# start GeoServer in the background
echo "Starting GeoServer..."
nohup "$GEOSERVER_HOME/bin/startup.sh" > >(tee /dev/stdout) 2>&1 &
echo "GeoServer started."

# wait for GeoServer to start responding
echo "Waiting for GeoServer..."
until curl -sSf http://localhost:8080/geoserver/web >/dev/null 2>&1; do
  sleep 0.5
done
echo "GeoServer is ready."

# drop into an interactive shell
exec /bin/bash
