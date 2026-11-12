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
# Every other variable the app knows (.env.example) or the checkout's own .env files define is
# printed empty: an empty value is still "set", so Next never fills it from .env.local, and the
# app's env schema reads it as unset. Only names are read from those files, never values.
set_here='NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_PRICING_CATALOG_VERSION R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_PUBLIC_BUCKET OPENAI_API_KEY SITE_INDEXING'
for f in "$root/.env.example" "$root"/.env "$root"/.env.local "$root"/.env.production "$root"/.env.production.local; do
  [ -f "$f" ] && sed -n 's/^[[:space:]]*\(export[[:space:]]*\)\{0,1\}\([A-Z_][A-Z0-9_]*\)=.*/\2/p' "$f"
done | sort -u | while read -r key; do
  case " $set_here " in *" $key "*) continue ;; esac
  case " $key " in
    # URL-typed public variables reject an empty value: point them at a closed local port.
    " NEXT_PUBLIC_SENTRY_DSN ") echo "$key=http://loadtest@127.0.0.1:9/0" ;;
    " NEXT_PUBLIC_ASSETS_BASE_URL ") echo "$key=http://127.0.0.1:9" ;;
    " NEXT_PUBLIC_POSTHOG_HOST ") echo "$key=http://127.0.0.1:9" ;;
    *) echo "$key=" ;;
  esac
done
