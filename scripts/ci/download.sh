#!/usr/bin/env bash
# Downloads one URL to a file for scripts/ci/retry.sh: exits 64 (give up) on an HTTP 4xx other
# than 408 and 429, e.g. a 404 for a CLI version that does not exist, and 75 (retry) on anything
# else: a 5xx, a timeout, a stall or a dropped connection. The file is written only when the
# download completed.
#
#   scripts/ci/retry.sh scripts/ci/download.sh <url> <output file>
set -u

url=${1:?url}
out=${2:?output file}
tmp="$out.part"

# --speed-limit/--speed-time: give up on an attempt that has moved under 10 kB/s for 30 s
# (GitHub's release host has held requests for 2 minutes before answering 504).
code=$(curl -sSL --connect-timeout 20 --max-time 300 --speed-limit 10000 --speed-time 30 \
  -o "$tmp" -w '%{http_code}' "$url")
status=$?
if [ "$status" -eq 0 ] && [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
  mv "$tmp" "$out"
  exit 0
fi
rm -f "$tmp"
echo "Download of $url failed: HTTP ${code:-none}, curl exit $status." >&2
# Only an HTTP answer that says the URL is wrong is final; a stall, a reset, a 5xx, 408 or 429 is not.
case "$code" in
  408 | 429) exit 75 ;;
  4??) exit 64 ;;
  *) exit 75 ;;
esac
