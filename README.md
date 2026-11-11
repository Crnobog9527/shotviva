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
- The script writes only to the test site or a local stack. A batch is all or nothing: every
  item (category, series, template) is listed with its result, and if any item fails nothing is
  kept and the exit code is 1. `--dry-run` runs the whole batch in one transaction and rolls it back.
- Re-running a file is safe: unchanged items are reported as unchanged.
- Production is never written by this script: templates, categories and series reach
  production through the "Sync preview templates to production" workflow (Owner approval).

## License

Proprietary. The source is public to read, but it is not open source: using, copying, modifying or hosting it needs a written commercial license from Grayscale Luminary LLC. See [LICENSE](LICENSE).
