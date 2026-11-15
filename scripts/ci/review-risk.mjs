/**
 * How much review a change needs (.github/workflows/codex-review.yml). Reads changed paths (one
 * per line) on stdin and prints one word:
 *
 *   high     touches money, credits, sign-in, permissions, the database, image providers, the
 *            proxy, secrets/config or CI itself (HIGH below), or any server action (a file that
 *            starts with 'use server': each one is an endpoint with its own sign-in or role
 *            check, e.g. admin/orders/actions.ts replays and claws back payments): Codex always
 *            reviews it, and the "Codex findings" check needs a finished Codex review.
 *   trivial  only docs, notes, design files, message catalogs or public images (TRIVIAL below):
 *            no Codex review unless someone asks with "@codex review".
 *   normal   everything else (pages, components, admin screens, styles): no automatic Codex
 *            review; unresolved Codex threads still fail "Codex findings" if one was requested.
 *
 * No paths at all prints `high`, so an unexpected empty diff gets the full review. Server actions
 * are recognised by reading the changed files, so run it from a checkout of the PR.
 *
 *   git diff --name-only base HEAD | node scripts/ci/review-risk.mjs
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const HIGH = [
  // Database: migrations, schema, SQL anywhere, the local stack's config.
  /^supabase\//,
  /\.sql$/,
  // Money: checkout, webhooks, credits and orders, prices, refunds and disputes, partner billing.
  /^src\/core\/(billing|jobs|codes|affiliate|partner|account|identity-guard|moderation|storage)\//,
  /^src\/core\/admin\/(orders|clawback-ui|disputes|disputes-ui|costs|products|code-editor|code-reports)\//,
  /^src\/site\/(billing|template-pricing)\//,
  // Template credit prices, floors and the cost guards behind them.
  /^src\/core\/templates\/[^/]*pric[^/]*\.ts$/,
  /^src\/site\/dispute-evidence\.ts$/,
  /^src\/app\/api\/(checkout|webhooks|generate|edit|poster|partner|codes|affiliate|account|uploads|files|cron|admin)\//,
  /^src\/app\/\[locale\]\/\(app\)\/checkout\//,
  // Sign-in and permissions.
  /^src\/core\/auth\//,
  /^src\/app\/auth\//,
  /^src\/app\/api\/auth\//,
  /^src\/app\/\[locale\]\/\(auth\)\//,
  /^src\/proxy\.ts$/,
  // Image providers: what is sent to paid upstream APIs and what it costs.
  /^src\/core\/providers\//,
  /^src\/core\/admin\/(providers|providers-editor|image-provider-field)\//,
  /^src\/modules\/[^/]+\/provider\//,
  // Configuration, secrets and environment, dependencies.
  /^src\/core\/(env|waffo-env|public-env|public-env-schema)\.ts$/,
  /^(next\.config\.[cm]?[jt]s|vercel\.json|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc)$/,
  // CI and release tooling: a change here can switch the other checks off.
  /^\.github\//,
  /^scripts\/(ci|release)\//,
]

export const TRIVIAL = [
  /\.md$/,
  /^(规范|seo资料|docs|design)\//,
  /^src\/site\/messages\/[^/]+\.json$/,
  /^public\/.+\.(png|jpe?g|webp|avif|svg|ico)$/,
]

const SERVER_DIRECTIVE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use server['"]/

/** Whether the file at `path` (relative to the working directory) is a server action module. */
export function isServerAction(path) {
  if (!/\.(ts|tsx|js|mjs)$/.test(path) || !existsSync(path) || !statSync(path).isFile()) return false
  return SERVER_DIRECTIVE.test(readFileSync(path, 'utf8'))
}

export function reviewRisk(paths, { serverAction = isServerAction } = {}) {
  const changed = paths.map((path) => path.trim()).filter(Boolean)
  if (changed.length === 0) return 'high'
  if (changed.some((path) => HIGH.some((pattern) => pattern.test(path)))) return 'high'
  if (changed.some((path) => serverAction(path))) return 'high'
  if (changed.every((path) => TRIVIAL.some((pattern) => pattern.test(path)))) return 'trivial'
  return 'normal'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${reviewRisk(readFileSync(0, 'utf8').split('\n'))}\n`)
}
