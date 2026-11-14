#!/usr/bin/env bash
# One Lighthouse CI measurement for the `lighthouse` jobs in ci.yml: collect, assert and save the
# reports for CONFIG, limited to the URLS given (space separated, from the job matrix).
#
#   scripts/ci/lighthouse-run.sh <config.json> <report dir> <url>...
#
# A run that fails only on largest-contentful-paint, each by at most LCP_RETRY_MARGIN_MS
# (default 100 ms) over its limit, is measured once more from scratch, and that second run
# decides. The limits do not change: the second run has to pass them itself. Anything else that
# fails (score, CLS, an LCP far over the limit, a failed collect) fails at once. Both attempts'
# reports are kept (<report dir>/attempt-1, attempt-2).
#
# Why: the devtools-throttled LCP gate (1.2 s, median of 5) measured 1.21–1.26 s on runs whose
# change did not touch the page, and a manual re-run passed each time.
set -uo pipefail

config=$1
out=$2
shift 2
margin=${LCP_RETRY_MARGIN_MS:-100}
lhci=(npx --yes @lhci/cli@0.15.1)

# The config with only the given URLs and the report directory under $out.
attempt_config() { # <attempt> <url>...
  local n=$1
  shift
  node -e '
    const [config, dir, ...urls] = process.argv.slice(1)
    const rc = JSON.parse(require("fs").readFileSync(config, "utf8"))
    const keep = rc.ci.collect.url.filter((url) => urls.includes(new URL(url).pathname))
    if (keep.length !== urls.length) { console.error(`unknown URL in ${urls} for ${config}`); process.exit(1) }
    rc.ci.collect.url = keep
    rc.ci.upload.outputDir = dir
    process.stdout.write(JSON.stringify(rc))
  ' "$config" "$out/attempt-$n" "$@" > "$out/lighthouserc-$n.json"
}

measure() { # <attempt> <url>...; returns the assert status, 2 when nothing was measured
  local n=$1 status
  shift
  rm -rf .lighthouseci
  attempt_config "$n" "$@" || return 2
  "${lhci[@]}" collect --config="$out/lighthouserc-$n.json" || return 2
  "${lhci[@]}" assert --config="$out/lighthouserc-$n.json"
  status=$?
  "${lhci[@]}" upload --config="$out/lighthouserc-$n.json" || true
  cp .lighthouseci/assertion-results.json "$out/attempt-$n/" 2>/dev/null || true
  return "$status"
}

# Prints "retry" when every failed error-level assertion is LCP and within the margin.
near_miss() { # <assertion-results.json>
  node -e '
    const [file, margin] = process.argv.slice(1)
    let results
    try { results = JSON.parse(require("fs").readFileSync(file, "utf8")) } catch { process.exit(0) }
    const failed = results.filter((r) => !r.passed && r.level === "error")
    const near = failed.length > 0 && failed.every((r) =>
      r.auditId === "largest-contentful-paint" && r.operator === "<=" &&
      typeof r.actual === "number" && r.actual - r.expected <= Number(margin))
    for (const r of failed) console.error(`${r.url}: ${r.auditId} ${r.actual} (limit ${r.expected})`)
    if (near) console.log("retry")
  ' "$1" "$margin"
}

mkdir -p "$out"
urls=("$@")
measure 1 "${urls[@]}"
status=$?
[ "$status" -eq 0 ] && exit 0
[ "$status" -eq 2 ] && { echo "::error::Lighthouse could not measure ${urls[*]}"; exit 1; }

if [ "$(near_miss "$out/attempt-1/assertion-results.json")" = retry ]; then
  echo "::warning::LCP missed its limit by at most ${margin} ms on ${urls[*]}; measuring once more (the limit stays)."
  measure 2 "${urls[@]}"
  status=$?
  if [ "$status" -eq 0 ]; then
    echo "::notice::The second measurement passed; the first one's reports are under attempt-1."
    exit 0
  fi
  echo "::error::LCP over its limit on two measurements in a row."
fi
exit 1
