#!/bin/bash
set -euo pipefail

DARK_GRAY="\033[0;90m"
RESET="\033[0m"

# when the script receives a SIGTERM or SIGINT signal,
# forward the signal to all child processes (e.g., postgres)
trap 'kill -TERM $(jobs -p) 2>/dev/null || true' SIGTERM SIGINT

# add an alias for exit that stops the container
cat >> ~/.bashrc <<'EOF'
alias exit='
  echo "$SESSION_ID" >> /tmp/session_exited;
  CID=$(hostname);
  echo -ne "Stopping container $CID... ";
  kill -s SIGTERM 1;
  curl --silent --output /dev/null \
      --unix-socket /var/run/docker.sock \
      -X POST "http://localhost/containers/${CID}/stop?t=10";
'
EOF

# remove username and container ID from the bash prompt for cleaner look
echo 'export PS1="\[\e[1;32m\]campus-map\[\e[0m\]:\[\e[1;34m\]\\w\[\e[0m\]\\$ "' >> ~/.bashrc

# start postgres server in the background with output suppressed
echo -ne "\r\033[K${DARK_GRAY}Starting PostgreSQL server...${RESET}\n"
touch /tmp/container_ready
sudo -u postgres /usr/lib/postgresql/18/bin/postgres -D "$PGDATA" > /dev/null 2>&1 &
PG_PID=$!

# if the container was started with a command, run it
if [ $# -gt 0 ]; then
  exec "$@"
else
  # or just start a bash shell
  exec bash &
fi

# do not exit this script until postgres exits
echo -e ""
wait "$PG_PID"
