#!/usr/bin/env bash
# Downloads one URL to a file for scripts/ci/retry.sh: exits 75 (retry) on a 5xx, 408, 429,
# a timeout or a dropped connection, and 64 (give up) on any other HTTP error, e.g. a 404 for a
# CLI version that does not exist. The file is written only when the download completed.
#
#   scripts/ci/retry.sh scripts/ci/download.sh <url> <output file>
set -u

url=${1:?url}
out=${2:?output file}
tmp="$out.part"

code=$(curl -sSL --connect-timeout 20 --max-time 300 -o "$tmp" -w '%{http_code}' "$url")
status=$?
if [ "$status" -eq 0 ] && [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
  mv "$tmp" "$out"
  exit 0
fi
rm -f "$tmp"
echo "Download of $url failed: HTTP ${code:-none}, curl exit $status." >&2
case "$code" in
  5?? | 408 | 429 | 000 | '') exit 75 ;;
  *) exit 64 ;;
esac
