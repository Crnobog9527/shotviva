# Shotviva

AI product-photo studio for small restaurants. Also the reusable launch template:
a new site changes `src/site/`, `.env` and `supabase/seed` only.

Rules: [`规范/AGENTS.md`](规范/AGENTS.md) · Architecture: [`规范/ARCHITECTURE.md`](规范/ARCHITECTURE.md)

## Layout

```
src/core     shared by every site; never imports modules/ site/ app/
src/modules  feature modules (image, video); import core only, never each other
src/site     per-site config, content and messages
src/app      Next.js routes; assembly only
supabase/    local config and migrations
tests/db     tests against a real local Supabase
```

## Commands

```bash
pnpm install
pnpm dev
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm db:start && pnpm test:db   # needs Docker
```

## Template batch script

Templates, their categories and series can be created and edited from a local JSON file
instead of the admin pages. Every change goes through the same database functions and checks
the admin uses; nothing is written by hand.

```bash
pnpm templates:apply .local/templates/<batch>.json --dry-run   # check everything, keep nothing
pnpm templates:apply .local/templates/<batch>.json             # apply to the test site
```

- Format: [`scripts/templates.example.json`](scripts/templates.example.json). Batch files hold
  private prompts, so they must live under a gitignored `.local/` folder; the script refuses others.
- Needs `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SHOTVIVA_IMPORT_ADMIN_ID`
  (your admin user id on that site) in `.env.local`. Uploading covers and style references also
  needs `TEMPLATE_TOOLS_R2_*` (see below); the buckets and the cover address are fixed in the script, and a
  `.env.local` set up for another site stops it. `TEMPLATE_SYNC_REVALIDATE_SECRET` (optional)
  refreshes the test site's catalogue right after a run; without it the site catches up within the hour.
- The script writes only to the test site or a local stack. It first runs the whole batch and
  rolls it back, uploads files only if that passed, then writes. A batch is all or nothing: every
  item is listed with its result, and if any item fails nothing is kept and the exit code is 1.
  `--dry-run` stops after the check. At most 300 items per batch (a series counts twice).
- Re-running a file is safe: unchanged items are reported as unchanged.
- `pnpm templates:trial <batch>.json [--dry-run] [--only a,b] [--n 3] [--budget 2] [--concurrency 2]`
  runs each template's `trial` inputs through the admin's own trial run (same prompt assembly,
  provider, face-swap screen, daily budget and ledger). Results already in the database are reused
  (run ids come from the content: prompt version, model, fields, input and photo), provider hiccups
  are retried, and new runs stop at `--budget` (USD, default 2) or the daily trial budget. Results
  and a review page land in `.local/trials/` (`index.html`: benchmarks, inputs and every result by
  prompt version; no prompt text). Needs `TEMPLATE_TOOLS_R2_ACCOUNT_ID`,
  `TEMPLATE_TOOLS_R2_ACCESS_KEY_ID` and `TEMPLATE_TOOLS_R2_SECRET_ACCESS_KEY` for the test site's
  buckets (the same keys let templates:apply upload covers and style references).
- R2 keys for both tools, in `.env.local` (fill in your own; never paste them anywhere):

  ```bash
  # A Cloudflare R2 API token limited to the test site's buckets shotviva-preview and
  # shotviva-assets-preview (Object Read & Write). Not the shell's R2_* variables.
  TEMPLATE_TOOLS_R2_ACCOUNT_ID=<Cloudflare account id>
  TEMPLATE_TOOLS_R2_ACCESS_KEY_ID=<the token's Access Key ID>
  TEMPLATE_TOOLS_R2_SECRET_ACCESS_KEY=<the token's Secret Access Key>
  ```

  At start the tools check the token cannot reach the production bucket `shotviva-assets`; if it
  can, they stop. `pnpm templates:trial` runs with `NODE_USE_ENV_PROXY=1`, so on a machine that
  reaches the model provider through `HTTPS_PROXY` its calls use that proxy too.
- Production is never written by this script: templates, categories and series reach
  production through the "Sync preview templates to production" workflow (Owner approval).

## License

Proprietary. The source is public to read, but it is not open source: using, copying, modifying or hosting it needs a written commercial license from Grayscale Luminary LLC. See [LICENSE](LICENSE).
