#!/usr/bin/env bash
# Runs a command until it succeeds, at most RETRY_ATTEMPTS times (default 5), waiting
# RETRY_BASE_DELAY seconds (default 5) before the second attempt and doubling each time after
# (5, 10, 20, 40 s). T88: registry and release downloads fail now and then with 5xx or time
# out, and one rerun of the whole job costs minutes.
#
#   scripts/ci/retry.sh <command> [args…]
#
# The command decides what is worth retrying: exit code 75 (EX_TEMPFAIL) or any other failure
# is retried, except exit code 64 (EX_USAGE), which the wrappers in this folder use for errors
# no retry can fix (a 404, a missing image). The last exit code is returned.
set -u

attempts=${RETRY_ATTEMPTS:-5}
delay=${RETRY_BASE_DELAY:-5}

[ "$#" -gt 0 ] || { echo "usage: retry.sh <command> [args…]" >&2; exit 64; }

for ((attempt = 1; ; attempt++)); do
  "$@"
  status=$?
  [ "$status" -eq 0 ] && exit 0
  if [ "$status" -eq 64 ]; then
    echo "::error::$1 failed permanently (exit 64); not retrying." >&2
    exit "$status"
  fi
  if [ "$attempt" -ge "$attempts" ]; then
    echo "::error::$1 failed $attempt times (last exit $status); giving up." >&2
    exit "$status"
  fi
  echo "::warning::$1 failed (attempt $attempt of $attempts, exit $status); retrying in ${delay}s." >&2
  sleep "$delay"
  delay=$((delay * 2))
done
