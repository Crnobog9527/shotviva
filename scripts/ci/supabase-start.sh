#!/usr/bin/env bash
# One `supabase start` attempt for scripts/ci/retry.sh (T88). The CLI pulls any image that is
# not loaded yet, and a registry 5xx, a timeout or a container that never got healthy fails the
# attempt: the half-started stack is stopped and the attempt exits 75, so retry.sh starts again
# (images pulled so far stay). A migration that fails to apply prints a Postgres SQLSTATE; no
# retry fixes that, so it exits 64 and the job fails at once with the SQL error above.
#
#   scripts/ci/retry.sh scripts/ci/supabase-start.sh <services to exclude, comma separated>
set -u

# The Go CLI itself when the release ships it (2.107+: `supabase` is a wrapper around
# `supabase-go`). Through the wrapper, CI runs sat idle for up to 95 s after the stack was up.
cli=supabase
command -v supabase-go > /dev/null && cli=supabase-go

log=$(mktemp)
began=$(date +%s)
"$cli" start -x "${1:?services to exclude}" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
echo "$cli start exited $status after $(( $(date +%s) - began ))s."
if [ "$status" -eq 0 ]; then
  rm -f "$log"
  exit 0
fi
permanent=false
grep -q 'SQLSTATE' "$log" && permanent=true
rm -f "$log"
"$cli" stop --no-backup > /dev/null 2>&1 || true
[ "$permanent" = true ] && exit 64
exit 75
