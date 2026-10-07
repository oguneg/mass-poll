#!/usr/bin/env bash
# Update the running app to the latest commit on GitHub. Run on the VPS:
#   ~/mass-poll/deploy/update.sh
#
# Everything is inside main() so bash parses the whole file before running it: `git pull` may
# replace this file mid-run. After pulling, the script re-executes the fresh version.
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."

  if [ -z "${MP_PULLED:-}" ]; then
    git pull --ff-only --quiet
    MP_PULLED=1 exec "$0" "$@"
  fi

  local commit deployed status=""
  commit=$(git rev-parse --short HEAD)
  deployed=$(cat .deployed 2>/dev/null || true)
  echo "code: ${deployed:-none} -> $commit"
  if [ "$commit" = "$deployed" ] && [ -n "$(docker compose ps -q app)" ]; then
    echo "already up to date"
    return 0
  fi

  # Build first while the old container keeps serving, then swap (a couple of seconds of restart).
  docker compose build --quiet app
  docker compose up -d --remove-orphans

  for _ in $(seq 1 30); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || true)
    [ "$status" = "healthy" ] && break
    sleep 2
  done
  echo "app: ${status:-unknown}"

  docker image prune -f >/dev/null
  [ "$status" = "healthy" ] || return 1
  echo "$commit" > .deployed
}

main "$@"
