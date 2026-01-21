#!/usr/bin/env bash
set -euo pipefail



IMAGE="campus-map-server:latest"
CONTAINER="campus-map-server"

WHITE_ON_DARK_CYAN="\033[1;37;46m"
GREEN="\033[0;32m"
YELLOW_ITALIC="\033[3;33m"
BOLD_DARK_GRAY="\033[1;90m"
DARK_GRAY="\033[0;90m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
BOLD_RED="\033[1;31m"
RESET="\033[0m"

# build image if it doesn't exist
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo -e "${DARK_GRAY}Container image not found. Building $IMAGE...${RESET}"
  docker build -t "$IMAGE" .
  echo ""
fi

# find container id if it running
container_id="$(docker ps -q -f name="^${CONTAINER}$")"
if [ -n "$container_id" ]; then
  container_is_running=true
else
  container_is_running=false
fi

# delete any stopped container with the same name
if [ "$container_is_running" = false ] && docker container inspect "$CONTAINER" >/dev/null 2>&1; then
  echo -e "${DARK_GRAY}Removing stopped container...${RESET}"
  docker rm "$CONTAINER" >/dev/null
fi

# start container if not running
if [ "$container_is_running" = false ]; then
  echo -e "${DARK_GRAY}Starting container...${RESET}"
  
  docker run -dit --user $(id -u):$(id -g) \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$(pwd)/server:/app/server" \
    -v "$(pwd)/client:/app/client" \
    --env-file "$(pwd)/.env" \
    -p 3000:3000 \
    -p 24678:24678 \
    -p 5433:5432 \
    --name "$CONTAINER" \
    "$IMAGE" >/dev/null
fi

# stream logs from the container
# so we can see output messages from the docker-entrypoint.sh script
if [ "$container_is_running" = false ]; then
  docker logs -f "$CONTAINER" &
  LOG_PID=$!
else
  # stream only new logs from the already running container
  docker logs -f --tail 0 "$CONTAINER" &
  LOG_PID=$!
fi

SESSION_ID=$(uuidgen)

on_error() {
  # copy the session_exited file from the container
  # and check if it contains our SESSION_ID
  local stop_reason="unexpected"
  if docker cp "$CONTAINER":/tmp/session_exited /tmp/session_exited.$$ 2>/dev/null; then
    exited_sessions=$(cat /tmp/session_exited.$$ | tr -d '\r')
    rm -f /tmp/session_exited.$$
    if echo "$exited_sessions" | grep -q "$SESSION_ID"; then
      stop_reason="user_initiated"
    else
      stop_reason="other_terminal"
    fi
  fi

  # print disconnection info
  local code=$1
  echo -ne "\033[2K\r${WHITE_ON_DARK_CYAN} $CONTAINER ${RESET}  ${RED}disconnected${RESET}\n"
  if [ "$code" -eq 137 ]; then
    # exit code 137 means the container was stopped (SIGKILL)
    # which is expected when the user runs 'exit' inside the container shell
    if [ "$stop_reason" = "other_terminal" ]; then
      echo -e "${DARK_GRAY}Container stopped from another terminal (exit code 137).${RESET}"
    else
      echo -e "${DARK_GRAY}Container stopped (exit code 137).${RESET}" 
    fi
  elif [ "$code" -eq 130 ]; then
    # ensure the container is stopped and removed
    # docker rm "$CONTAINER" --force >/dev/null 2>&1 || true
    # exit code 130 means the user pressed CTRL+C to terminate the script
    if [ "$stop_reason" = "other_terminal" ]; then
      echo -e "${DARK_GRAY}Container stopped from another terminal (exit code 130).${RESET}"
    else
      echo -e "${DARK_GRAY}Container stopped (exit code 130).${RESET}"
    fi
  else
    echo -e "${BOLD_RED}ERROR:${RESET} The container encountered an error (exit code $code)."
    if [ "$stop_reason" = "other_terminal" ]; then
      echo -e "${DARK_GRAY}(the error occurred in another terminal session)${RESET}"
    fi
    echo "You can review the output above for details."
  fi
  echo ""
  
  # ensure the container is stopped and removed
  docker rm "$CONTAINER" --force >/dev/null 2>&1 || true

  # if the stop reason was not user_initiated, prompt to press ENTER to exit
  if [ "$stop_reason" != "user_initiated" ]; then
    echo "Press ENTER to exit..."
    read -r _
  else
    echo "Exiting..."
    sleep 1.5
  fi
  exit 0
}

# attach to its shell
docker exec -it -e SESSION_ID="$SESSION_ID" "$CONTAINER" bash -c '
WHITE_ON_DARK_CYAN="\033[1;37;46m"
GREEN="\033[0;32m"
YELLOW_ITALIC="\033[3;33m"
YELOW="\033[0;33m"
BOLD_DARK_GRAY="\033[1;90m"
DARK_GRAY="\033[0;90m"
RESET="\033[0m"

# ----- print the 'connecting' banner inside the container -----
# echo -e "${WHITE_ON_DARK_CYAN} '"$CONTAINER"' ${RESET}  ${YELOW}connecting${RESET}"
until [ -f /tmp/container_ready ]; do sleep 0.5; done

# ----- print the 'connected' banner inside the container -----
echo -e "${WHITE_ON_DARK_CYAN} '"$CONTAINER"' ${RESET}  ${GREEN}connected${RESET}"
echo -e "   ${BOLD_DARK_GRAY}run ${YELLOW_ITALIC}exit${RESET}${BOLD_DARK_GRAY} to stop this container${RESET}"
echo -e "   ${DARK_GRAY}run ${YELLOW_ITALIC}npm run dev${RESET}${DARK_GRAY} to start the development server${RESET}"
echo -e "   ${DARK_GRAY}run ${YELLOW_ITALIC}npm install${RESET}${DARK_GRAY} to install dependencies${RESET}"
echo -e "   ${DARK_GRAY}run ${YELLOW_ITALIC}npm run build${RESET}${DARK_GRAY} to output an optimized production build${RESET}"
echo -e "   ${DARK_GRAY}run ${YELLOW_ITALIC}npm run start${RESET}${DARK_GRAY} to start the server${RESET}"
echo
# -------------------------------------------------------------
exec bash
' || on_error $?

# stop streaming logs when the shell exits
kill "$LOG_PID" >/dev/null 2>&1 || true
