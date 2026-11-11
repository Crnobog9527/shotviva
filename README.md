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
  private prompts, so they live in the gitignored `.local/`; never commit one.
- Needs `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SHOTVIVA_IMPORT_ADMIN_ID`
  (your admin user id on that site) in `.env.local`. Covers and style references also need the
  R2 keys, `R2_BUCKET`, `R2_PUBLIC_BUCKET` and `NEXT_PUBLIC_ASSETS_BASE_URL`.
- The script writes only to the test site or a local stack. Each item (category, series,
  template) succeeds or fails on its own and is listed with its error code; the exit code is 1
  if any item failed. `--dry-run` runs the whole batch in one transaction and rolls it back.
- Re-running a file is safe: unchanged items are reported as unchanged.
- Production: template content goes through the "Sync preview templates to production"
  workflow. Categories, series, filing, model, sale and publish go through the
  "Apply template structure to production" workflow, which needs the Owner's approval:

  ```bash
  pnpm templates:apply .local/templates/<batch>.json --production-batch > /tmp/batch.b64
  gh workflow run template-apply.yml --ref main -f dry_run=true -f batch="$(cat /tmp/batch.b64)"
  ```

  The production batch carries no prompts, prices, covers or files (it is visible on the run page).

## License

Proprietary. The source is public to read, but it is not open source: using, copying, modifying or hosting it needs a written commercial license from Grayscale Luminary LLC. See [LICENSE](LICENSE).
