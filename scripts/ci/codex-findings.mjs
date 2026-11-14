/**
 * The "Codex findings" check (.github/workflows/codex-review.yml): makes Codex's review of a pull
 * request visible before merge, instead of a comment nobody opened.
 *
 *   - Fails while a Codex review thread is unresolved and not outdated: a finding on code that is
 *     still there. Handle it one of two ways:
 *       fix:        push the fix; the thread turns outdated (or resolve it) and this passes.
 *       won't fix:  resolve the thread, then reply in it with the reason ("Won't fix: …"); the
 *                   reply re-runs this check (resolving alone triggers no workflow).
 *   - Passes, with a warning listing each one, for unresolved outdated threads: a later commit
 *     changed those lines, which may or may not have handled the finding.
 *   - For a high-risk change (scripts/ci/review-risk.mjs), fails until Codex has finished at least
 *     one code review of the PR, and warns when the head is newer than the reviewed commit.
 *     Codex ignores "@codex review" from bots, so a person (or the session that opened the PR,
 *     with the Owner's gh login: scripts/ci/codex-request.mjs) asks for the review. While a review is still running it waits for it (up to
 *     WAIT_MINUTES), because a review without findings only edits Codex's summary comment and
 *     triggers no workflow.
 *
 * Env: GH_TOKEN, REPO (owner/name), PR (number), HEAD_SHA, RISK (high | normal | trivial),
 * WAIT_MINUTES (default 20). Writes a summary to GITHUB_STEP_SUMMARY when set.
 */
import { appendFileSync } from 'node:fs'

export const CODEX = 'chatgpt-codex-connector'
const env = process.env
const [owner, name] = (env.REPO ?? '').split('/')

async function github(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.GH_TOKEN}`, accept: 'application/vnd.github+json', ...init.headers },
  })
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  return response.json()
}

const isCodex = (login) => typeof login === 'string' && login.replace(/\[bot\]$/, '') === CODEX

async function threads() {
  const query = `query($owner: String!, $name: String!, $pr: Int!, $after: String) {
    repository(owner: $owner, name: $name) { pullRequest(number: $pr) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { isResolved isOutdated path line
          comments(first: 1) { nodes { author { login } url body } } }
      } } } }`
  const all = []
  let after = null
  do {
    const { data, errors } = await github('/graphql', {
      method: 'POST',
      body: JSON.stringify({ query, variables: { owner, name, pr: Number(env.PR), after } }),
    })
    if (errors) throw new Error(JSON.stringify(errors))
    const page = data.repository.pullRequest.reviewThreads
    all.push(...page.nodes)
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
  } while (after)
  return all.filter((thread) => isCodex(thread.comments.nodes[0]?.author?.login))
}

/** Codex's own record on the PR: the `codex-review-state:v1` JSON in its summary comment. */
export function parseReviewState(body) {
  const match = /<!--\s*codex-review-state:v1\s*(\{.*?\})\s*-->/s.exec(body ?? '')
  if (!match) return null
  try {
    return JSON.parse(match[1]).code_review ?? null
  } catch {
    return null
  }
}

export async function reviewState() {
  const comments = await github(`/repos/${owner}/${name}/issues/${env.PR}/comments?per_page=100`)
  const reviews = await github(`/repos/${owner}/${name}/pulls/${env.PR}/reviews?per_page=100`)
  const summary = comments.filter((c) => isCodex(c.user?.login)).map((c) => parseReviewState(c.body)).filter(Boolean).at(-1)
  const reviewed = reviews.filter((r) => isCodex(r.user?.login)).map((r) => r.commit_id)
  // A review in progress outranks earlier ones: until it ends its findings are unknown, so the
  // check waits for it instead of passing on an older review.
  const running = Boolean(summary && summary.status !== 'completed')
  return {
    completed: !running && (summary?.status === 'completed' || reviewed.length > 0),
    running,
    commit: summary?.status === 'completed' ? summary.commit_sha : (reviewed.at(-1) ?? null),
  }
}

const titleOf = (thread) =>
  (thread.comments.nodes[0]?.body ?? '')
    .replace(/<[^>]+>|!\[[^\]]*\]\([^)]*\)|\*\*/g, '')
    .trim()
    .split('\n')[0]

export function judge({ risk, codexThreads, state }) {
  const open = codexThreads.filter((t) => !t.isResolved && !t.isOutdated)
  const stale = codexThreads.filter((t) => !t.isResolved && t.isOutdated)
  const lines = []
  const table = []
  let ok = true
  for (const t of open) {
    ok = false
    const url = t.comments.nodes[0]?.url
    lines.push(`::error file=${t.path},line=${t.line ?? 1}::Unresolved Codex finding: ${titleOf(t)} (${url})`)
    table.push(`| ❌ open | ${titleOf(t)} | \`${t.path}\` | ${url} |`)
  }
  // A later commit changed those lines: maybe fixed, maybe not. Listed so the reviewer checks.
  for (const t of stale) {
    const url = t.comments.nodes[0]?.url
    lines.push(`::warning file=${t.path}::Outdated Codex finding still unresolved, check it was handled: ${titleOf(t)} (${url})`)
    table.push(`| ⚠️ outdated | ${titleOf(t)} | \`${t.path}\` | ${url} |`)
  }
  if (state.running) {
    ok = false
    lines.push('::error::A Codex review is still running; this check re-runs when it posts findings, or re-run it once Codex reacts 👍.')
  } else if (risk === 'high' && !state.completed) {
    ok = false
    lines.push(
      '::error::High-risk change (money, sign-in, database, providers, proxy or CI) without a finished Codex review. ' +
        'Comment "@codex review" on the PR from a person\'s account (Codex ignores bots).',
    )
  }
  if (risk === 'high' && state.completed && state.commit && env.HEAD_SHA && !env.HEAD_SHA.startsWith(state.commit.slice(0, 7))) {
    lines.push(
      `::warning::Codex last reviewed ${state.commit.slice(0, 7)}, not the head ${env.HEAD_SHA.slice(0, 7)}. ` +
        'If later commits change money, sign-in, database or provider code, comment "@codex review" again.',
    )
  }
  return { ok, lines, table, open: open.length, stale: stale.length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const risk = env.RISK ?? 'high'
  const deadline = Date.now() + Number(env.WAIT_MINUTES ?? 20) * 60_000
  let state = await reviewState()
  while ((state.running || (risk === 'high' && !state.completed)) && Date.now() < deadline) {
    console.log(state.running ? 'Codex review running; waiting for it…' : 'No Codex review yet; waiting for one…')
    await new Promise((resolve) => setTimeout(resolve, 30_000))
    state = await reviewState()
  }
  const result = judge({ risk, codexThreads: await threads(), state })
  for (const line of result.lines) console.log(line)
  const reviewed = state.completed ? `yes (${state.commit?.slice(0, 7) ?? '?'})` : 'no'
  const rows = result.table.length ? `\n| | Finding | File | Thread |\n|---|---|---|---|\n${result.table.join('\n')}\n` : ''
  const summary = `### Codex findings\n\nRisk: **${risk}** · Codex review finished: **${reviewed}** · unresolved findings: **${result.open}** · outdated, unresolved: ${result.stale}\n${rows}`
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary)
  console.log(summary)
  process.exit(result.ok ? 0 : 1)
}
