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

## License

Proprietary. The source is public to read, but it is not open source: using, copying, modifying or hosting it needs a written commercial license from Grayscale Luminary LLC. See [LICENSE](LICENSE).
