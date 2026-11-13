#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand). Exit 0 cancels the build, exit 1 builds.
#
# Skips only when the app the build produces cannot have changed: the diff between the last
# successful deployment of this branch (VERCEL_GIT_PREVIOUS_SHA) and HEAD ran without error and
# touches none of APP_PATHS. Comparing with the previous deployment, not HEAD^, means a release
# after several test-only merges still builds when any of them changed the app, and a skipped
# deployment never moves the baseline (it is not a successful deployment).
#
# Anything uncertain builds: no previous SHA (first deployment of a branch), a SHA that is not
# in the clone and cannot be fetched, or git failing. SHOTVIVA_FORCE_BUILD=1 always builds
# (e.g. `vercel deploy --prod -b SHOTVIVA_FORCE_BUILD=1` to pick up changed env vars).
#
# Add a path here whenever the build starts reading something outside it.
set -u

APP_PATHS=(
  src
  ':(glob,exclude)src/**/*.test.ts'
  ':(glob,exclude)src/**/*.test.tsx'
  public
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  .npmrc
  .nvmrc
  next.config.ts
  next.config.js
  next.config.mjs
  next-env.d.ts
  tsconfig.json
  postcss.config.mjs
  postcss.config.js
  tailwind.config.ts
  tailwind.config.js
  vercel.json
  # `pnpm build` runs these before `next build` (package.json).
  scripts/public-css-sources.ts
  scripts/public-css-sources-lib.ts
  scripts/check-waffo-catalog.ts
  # This decision itself.
  scripts/ci/vercel-ignore-build.sh
)

build() { echo "▶ build: $1"; exit 1; }

[ "${SHOTVIVA_FORCE_BUILD:-}" = 1 ] && build 'SHOTVIVA_FORCE_BUILD=1'

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -n "$prev" ] || build 'no previous successful deployment on this branch'
[[ "$prev" =~ ^[0-9a-f]{7,40}$ ]] || build "previous SHA '$prev' is not a commit hash"

if ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
  # Vercel clones shallowly; try to fetch just that commit, never prompting for credentials.
  GIT_TERMINAL_PROMPT=0 git fetch --quiet --no-tags --depth=1 origin "$prev" >/dev/null 2>&1 || true
  git cat-file -e "$prev^{commit}" 2>/dev/null || build "previous deployment $prev is not in the clone"
fi

changed=$(git diff --name-only "$prev" HEAD -- "${APP_PATHS[@]}" 2>&1)
status=$?
[ "$status" -eq 0 ] || build "git diff failed ($status): $changed"

if [ -n "$changed" ]; then
  echo "App files changed since $prev:"
  printf '%s\n' "$changed" | head -20
  build 'app changed'
fi

echo "■ skip: nothing the app is built from changed since $prev"
exit 0
