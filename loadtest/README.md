# Load tests

Everything here runs against **your local machine only**: a local Supabase stack, a local
`next start`, and a local stub that stands in for R2 and the OpenAI image API. No production
or preview traffic, no real storage, no model spend. Never point these scripts at a hosted
project. The seed creates accounts `loadtest-N@example.test` with the password
`loadtest-password`, on the local stack only.

Guards against running it anywhere else:
- `seed/catalogue.sql` stops before writing anything if the database has any account that is
  not `loadtest-N@example.test` (seed only a fresh `supabase db reset`).
- `k6/lib.js` refuses a `BASE_URL` or `SUPABASE_URL` that is not `localhost` / `127.0.0.1`.
- `run/env.sh` prints every other variable from `.env.example` and the checkout's `.env*` files
  empty (or, for the three URL-typed public ones, a closed local port), so a `.env.local` with
  real keys is never picked up by the build or the server.

Local Docker follows AGENTS §7: take the lock `/tmp/shotviva-db-lock`, and when you are done
stop the stack (`supabase stop --no-backup`) and remove the lock.

## Pieces

| Path | What it is |
|---|---|
| `seed/catalogue.sql` | Synthetic, production-shaped catalogue: category tree, series of high-quality members, medium templates with an approved price batch, partner-only and below-floor templates, a 30-day job history, sign-in users. `-v scale=N` multiplies templates/series/categories, `-v jobs=N` sets the history, `-v users=N` the accounts. Made-up names, prices and prompts. |
| `db/explain.sql` | `EXPLAIN (ANALYZE, BUFFERS)` of the catalogue reads, as `anon` / `service_role`. |
| `db/equivalence.sql` | Prints ~46k sale decisions (catalogue, floors, reservation checks) so a change to the sale guard can be diffed before/after. |
| `db/bench.sh`, `db/q*.sql`, `db/mix.sql` | pgbench of the catalogue reads inside the db container. |
| `db/compare.sh` | Resets, seeds and benchmarks without and with a range of new migrations, per data shape. Destroys the local database. |
| `stub/server.mjs` | HTTPS stub: S3 PUT/GET/HEAD/DELETE/List in memory, `/v1/images/*` returning a fixed PNG after `LOADTEST_IMAGE_MS` (default 20 s), `/v1/moderations`. `GET /__stats` shows counts. |
| `stub/preload.mjs` | Loaded into `next start` with `--import`: sends TLS connections for `*.r2.cloudflarestorage.com` and `api.openai.com` to the stub, keeping the server name. App code is unchanged. |
| `stub/gen-cert.sh`, `stub/make-images.mjs` | Stub certificate and the synthetic input/output images, written to `loadtest/.stub/` (git-ignored). |
| `run/env.sh`, `run/start-app.sh`, `run/serve.mjs` | Environment and build/start of the production build on `:3100` against the local stack and the stub. Fake keys only. `serve.mjs` is the same server as `next start` under a process name other sessions' `pkill -f "next start"` clean-ups do not hit. |
| `run/monitor.sh` | Samples connections by state, the longest running query, db/PostgREST CPU and app memory every 5 s. |
| `run/suite.sh`, `run/summarize.mjs` | Runs every scenario at each level (10, 50, 100, 300) as its own run with the monitor alongside, then one markdown table per label. |
| `k6/shotviva.js` | k6 scenarios, ramping 10 → 50 → 100 → 300 users. |

## Database benchmark

```bash
supabase start
docker exec -i supabase_db_shotviva psql -U postgres -v scale=1 -v jobs=32 < loadtest/seed/catalogue.sql
docker exec -i supabase_db_shotviva psql -U postgres < loadtest/db/explain.sql
loadtest/db/bench.sh supabase_db_shotviva 10 15 mix.sql
```

## App load test

```bash
supabase start && supabase db reset
docker exec -i supabase_db_shotviva psql -U postgres -v scale=1 -v jobs=884 -v users=300 < loadtest/seed/catalogue.sql
loadtest/stub/gen-cert.sh 0000000000000000000000000000beef
node loadtest/stub/make-images.mjs
node loadtest/stub/server.mjs &                      # LOADTEST_IMAGE_MS=20000 by default
loadtest/run/start-app.sh build && loadtest/run/start-app.sh start &
loadtest/run/suite.sh mylabel                        # all four scenarios, each level its own run
node loadtest/run/summarize.mjs mylabel
```

One scenario by hand:

```bash
k6 run -e SCENARIO=create -e SUPABASE_ANON_KEY="$(supabase status -o env | sed -n 's/^ANON_KEY="\(.*\)"/\1/p')" loadtest/k6/shotviva.js
```

`SCENARIO` is `marketing` (anonymous pages), `create` (Create grid + a template's workspace),
`generate` (upload ticket → PUT to the stub → synchronous `/api/generate` with the stubbed
model → status read), `photos`, or `all`. `LEVELS` (default `10,50,100,300`), `HOLD` (60s) and
`STEP` (20s) shape the ramp; `USERS` is how many seeded accounts sign in during setup.

The signed-in scenarios also check that the page was not redirected to `/login` (k6 follows
redirects), which is how an overloaded auth check shows up. The generate scenario sends the
template's 1K price as `expected_credits` (`EXPECTED_CREDITS`, default 120 for the seeded series
members) and PUTs the photo to the stub with the presigned URL's own path and `Host`.

## What it does not model

- Vercel: one local Node process stands in for many function instances; per-request latency
  includes this machine's CPU, not Vercel's. Fluid compute concurrency and cold starts are not
  reproduced.
- Supabase compute tier: the local Postgres has this machine's cores and memory, not the
  plan's. Use the database numbers as relative (before/after, which query breaks first), and
  scale by the plan's CPU for absolute capacity.
- The CDN: anonymous pages served from Vercel's edge cache never reach the function; locally
  every request does.
