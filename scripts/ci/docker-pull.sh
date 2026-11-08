#!/usr/bin/env bash
# `docker pull <image>` for scripts/ci/retry.sh (T88): exits 64 (give up) when the registry says
# the image or tag does not exist or access is denied, and 75 (retry) for anything else, which
# in practice is a 5xx, a timeout or a reset connection.
set -u

image=${1:?image}
log=$(mktemp)
docker pull --quiet "$image" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
if [ "$status" -eq 0 ]; then
  rm -f "$log"
  exit 0
fi
permanent=false
grep -Eqi 'manifest unknown|not found|denied|unauthorized' "$log" && permanent=true
rm -f "$log"
[ "$permanent" = true ] && exit 64
exit 75
