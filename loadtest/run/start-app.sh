#!/bin/sh
# Builds and starts the app on :3100 against the local stack, with R2/OpenAI sent to the stub.
#   loadtest/run/start-app.sh build   # once per code change
#   loadtest/run/start-app.sh start
set -e
here=$(cd "$(dirname "$0")" && pwd); root=$(cd "$here/../.." && pwd)
set -a; eval "$("$here/env.sh")"; set +a
cd "$root"
export NODE_EXTRA_CA_CERTS="$root/loadtest/.stub/cert.pem"
export NODE_OPTIONS="--import $root/loadtest/stub/preload.mjs ${NODE_OPTIONS:-}"
case "$1" in
  # Same steps as `pnpm build`: the generated public CSS sources and the Waffo price check first.
  build) pnpm css:sources && pnpm pricing:waffo --build && exec pnpm exec next build ;;
  start) NODE_ENV=production exec node "$root/loadtest/run/serve.mjs" ;;
  *) echo "usage: $0 build|start" >&2; exit 2 ;;
esac
