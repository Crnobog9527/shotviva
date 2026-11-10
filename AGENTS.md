# Agent instructions

Project rules, architecture and task cards live in the **private** repo
`Crnobog9527/shotviva-docs`, not here (this repo is public). On the Owner's machine it is cloned
next to this checkout: `/Volumes/灰度映画/出海项目/shotviva-docs`. Read
`/Volumes/灰度映画/出海项目/shotviva-docs/规范/AGENTS.md` first; wherever code comments or
task briefs say `规范/…`, `seo资料/…` or `docs/…`, read that path inside `shotviva-docs`.

- Never copy those documents, prices, costs or prompts back into this repo, a PR or a screenshot.
- Spec changes are `[spec]` PRs in `shotviva-docs`, reviewed and merged by the control window.
- Tests that need those files find them through `tests/support/private-docs.ts`
  (`SHOTVIVA_DOCS_DIR` overrides) and skip in CI, which has no copy.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
