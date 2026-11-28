# Agent instructions

Project rules, architecture and task cards live in the **private** repo
`Crnobog9527/shotviva-docs`, not here (this repo is public). On the Owner's machine it is cloned
on the internal disk: `/Users/simon/Projects/shotviva-docs` (run `git pull --ff-only` there first; the
old copy on the external disk `/Volumes/灰度映画/出海项目/` is retired). Read
`/Users/simon/Projects/shotviva-docs/规范/AGENTS.md` first; wherever code comments or
task briefs say `规范/…`, `seo资料/…` or `docs/…`, read that path inside `shotviva-docs`.

- Never copy those documents, prices, costs or prompts back into this repo, a PR or a screenshot.
- Spec changes are `[spec]` PRs in `shotviva-docs`, reviewed and merged by the control window.
- Tests that need those files find them through `tests/support/private-docs.ts`
  (`SHOTVIVA_DOCS_DIR` overrides) and skip in CI, which has no copy.

## Review guidelines

For Codex and Claude reviews on GitHub (and any reviewer). Codex reviews high-risk PRs
automatically and others when someone comments `@codex review` (`.github/workflows/codex-review.yml`).
While Codex is unavailable, Claude reviews instead and publishes the result with
`REPO=Crnobog9527/shotviva PR=<n> node scripts/ci/claude-review-post.mjs findings.json` (add
`--dry-run` to preview); the "Codex findings" check accepts it only as a PR review by the repository
owner's account carrying `<!-- claude-review:v1 commit=<sha> reviewer=<label> -->`. The Claude
review must come from a reviewer session separate from the PR's author, never the session that
wrote the change (the check cannot tell them apart: same login); `reviewer` names that session for
audit. An unresolved Codex or Claude thread on current code fails the check until it is fixed or
answered and resolved. The list below applies to both reviewers.

- Report as P0/P1 anything that can lose or create money or credits: a charge, grant, refund or
  clawback that can run twice or not at all (missing idempotency key, retry, race between two
  requests), credits taken from the wrong pool, a failed job that does not refund, prices or
  costs read from the client.
- Also P0/P1: a route, server action or API that skips the sign-in or role check; Supabase tables
  or functions callable by clients that should not be (RLS, `security definer`, grants); secrets
  or private prompts reaching the browser, logs or the public repo.
- Migrations must be append-only and expand-only: the code running in production before the
  deploy has to keep working on the migrated database. Flag any drop, rename or tightened
  constraint, and any change to an already merged migration file.
- Image providers: requests that send more, larger or different inputs than the provider
  accepts, wrong cost or size tiers, and fallbacks that silently switch to a pricier provider.
- `src/proxy.ts`, `next.config.ts` and CI workflows: anything that disables a check, widens
  what a public route serves, or changes caching of signed-in pages.
- Do not report style, naming, wording or formatting; lint and the type checker cover those.
  Docs, copy and image-only changes need no findings unless something there is broken.

## Browser validation

For Codex and Claude sessions that validate in a browser (Owner's rule, 2026-11-28).

- Run every browser step in a **headless** browser (headless Chrome or Playwright). Never open,
  drive or take over the Owner's own Google Chrome or any other desktop browser, and never bring
  a browser window to the foreground.
- Sign test identities in by opening the one-time link from
  `pnpm qa:login-email <email> --host user|admin|preview` (or `pnpm qa:login <persona>`) inside the
  headless browser. Never paste these links into chat or PRs.
- Known limitation: the Waffo test-mode checkout does not complete in headless runs but works by
  hand (issue #999). Steps that need a completed Waffo payment are done by the Owner by hand, or
  marked "covered by DB tests" in the result.
- Set up validation test data through the admin and org consoles only, never hand-written SQL,
  and restore it afterwards.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
