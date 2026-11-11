#!/bin/sh
# Environment for `next build` / `next start` against the local Supabase stack and the stub.
# Prints KEY=value lines; run/start-app.sh sources them. Fake keys only: nothing here reaches
# a real service (the preload sends R2 and OpenAI traffic to loadtest/stub/server.mjs).
set -e
root=$(cd "$(dirname "$0")/../.." && pwd)
eval "$(cd "$root" && supabase status -o env 2>/dev/null | sed 's/^/SB_/')"
cat <<VARS
NEXT_PUBLIC_SITE_URL=http://localhost:3100
NEXT_PUBLIC_SUPABASE_URL=$SB_API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SB_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SB_SERVICE_ROLE_KEY
NEXT_PUBLIC_PRICING_CATALOG_VERSION=v2
R2_ACCOUNT_ID=0000000000000000000000000000beef
R2_ACCESS_KEY_ID=loadtest
R2_SECRET_ACCESS_KEY=loadtest-secret
R2_BUCKET=shotviva-loadtest
R2_PUBLIC_BUCKET=shotviva-loadtest-public
OPENAI_API_KEY=sk-loadtest-not-a-real-key
SITE_INDEXING=off
VARS
