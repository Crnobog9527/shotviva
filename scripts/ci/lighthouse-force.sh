#!/usr/bin/env bash
# Reads changed paths (one per line) on stdin and prints `true` when Lighthouse must run whatever
# the page fingerprint says (scripts/ci/page-fingerprint.mjs), `false` otherwise.
#
# The fingerprint compares the bytes the measured pages send. These paths can change the
# measurement without changing those bytes, so they always run it:
#   - server code on every measured request: the proxy, instrumentation, the root layout and
#     the measured routes' own files (how fast the HTML is produced, not only what it is)
#   - the build and server setup: next.config, dependencies, Node version
#   - the measurement itself: lighthouserc*.json, the Lighthouse scripts, the fingerprint, the
#     CI workflow and the change detection
# No paths at all prints `true`. The path that forced it goes to stderr, for the CI log.
set -u

forced() { echo "$1" >&2; echo true; exit 0; }

any=false
while IFS= read -r path || [ -n "$path" ]; do
  [ -n "$path" ] || continue
  any=true
  case "$path" in
    *.test.ts | *.test.tsx) ;;
    src/proxy.ts | src/instrumentation.ts | src/instrumentation-client.ts | \
    next.config.* | package.json | pnpm-lock.yaml | pnpm-workspace.yaml | .npmrc | .nvmrc | \
    lighthouserc*.json | scripts/ci/lighthouse-* | scripts/ci/page-fingerprint.mjs | \
    .github/workflows/ci.yml | .github/actions/changes/* | scripts/ci/has-code-changes.sh)
      forced "$path" ;;
    # Files directly in the measured routes' folders (page, layout, loading, error, route-local
    # components): src/app/[locale]/*, (marketing)/*, (marketing)/pricing/*, (marketing)/[slug]/*.
    'src/app/[locale]/'*)
      rest=${path#'src/app/[locale]/'}
      case "$rest" in
        */*/*/*) ;;
        '(marketing)/pricing/'* | '(marketing)/[slug]/'*) forced "$path" ;;
        '(marketing)/'*/*) ;;
        '(marketing)/'*) forced "$path" ;;
        */*) ;;
        *) forced "$path" ;;
      esac
      ;;
  esac
done

[ "$any" = true ] || forced '(no changed files listed)'
echo false
