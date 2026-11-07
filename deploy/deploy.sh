#!/usr/bin/env bash
# Deploys prism-api on the VPS: pull main, build, restart, health-check, and roll
# back to the previous commit if the new build does not come up healthy.
#
# Streamed over SSH by .github/workflows/deploy.yml (`bash -s`). prism-web is on
# Vercel and deploys itself; this script only handles prism-api.
#
# Environment:
#   APP_DIR       checkout of the repository on the server (required)
#   RESTART_CMD   how to restart the API (default: sudo systemctl restart prism-api)
#   HEALTH_URL    default http://127.0.0.1:3999/health
#   BRANCH        default main
#   HEALTH_TRIES  health checks, 2 s apart (default 30)
set -euo pipefail

APP_DIR="${APP_DIR:?APP_DIR must point at the repository checkout}"
RESTART_CMD="${RESTART_CMD:-sudo systemctl restart prism-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3999/health}"
BRANCH="${BRANCH:-main}"

log() { echo "[deploy $(date -u +%FT%TZ)] $*"; }

build() {
  (cd "$APP_DIR/prism-api" && npm ci --include=dev && npm run build)
}

healthy() {
  local i
  for i in $(seq 1 "${HEALTH_TRIES:-30}"); do
    if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

release() {
  build && $RESTART_CMD && healthy
}

# Everything that runs is inside main(), so bash has read the whole script from
# stdin before the first command starts and nothing below can eat the script.
main() {
  cd "$APP_DIR"

  previous="$(git rev-parse HEAD)"
  git fetch --quiet origin "$BRANCH"

  # Fast-forward only: if the server checkout has diverged, stop and say so
  # rather than overwrite anything.
  git merge --ff-only "origin/$BRANCH"
  current="$(git rev-parse HEAD)"

  if [ "$previous" = "$current" ]; then
    log "already at ${current:0:7}, nothing to deploy"
    exit 0
  fi

  log "deploying ${previous:0:7} -> ${current:0:7}"

  if release; then
    log "deployed ${current:0:7}"
    exit 0
  fi

  log "release of ${current:0:7} failed, rolling back to ${previous:0:7}"
  git reset --hard "$previous"

  if release; then
    log "rolled back to ${previous:0:7}; ${current:0:7} is NOT live"
  else
    log "ROLLBACK FAILED: the API is not healthy, fix it by hand"
  fi

  exit 1
}

main "$@"
