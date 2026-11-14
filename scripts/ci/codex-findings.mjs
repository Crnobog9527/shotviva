/**
 * The "Codex findings" check (.github/workflows/codex-review.yml): makes Codex's review of a pull
 * request visible before merge, instead of a comment nobody opened.
 *
 *   - Fails while a Codex review thread is unresolved and not outdated: a finding on code that is
 *     still there. Fix it, or resolve the thread and reply why not (the reply re-runs this check;
 *     resolving alone triggers no workflow).
 *   - Warns (passes) for unresolved outdated threads: the lines changed since; resolve them once
 *     the finding is handled.
 *   - For a high-risk change (scripts/ci/review-risk.mjs), fails until Codex has finished at least
 *     one code review of the PR. While a review is still running it waits for it (up to
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
  return {
    completed: summary?.status === 'completed' || reviewed.length > 0,
    running: Boolean(summary && summary.status !== 'completed'),
    commit: summary?.status === 'completed' ? summary.commit_sha : (reviewed.at(-1) ?? null),
  }
}

export function judge({ risk, codexThreads, state }) {
  const open = codexThreads.filter((t) => !t.isResolved && !t.isOutdated)
  const stale = codexThreads.filter((t) => !t.isResolved && t.isOutdated)
  const lines = []
  let ok = true
  for (const t of open) {
    ok = false
    const title = (t.comments.nodes[0]?.body ?? '').replace(/<[^>]+>|!\[[^\]]*\]\([^)]*\)|\*\*/g, '').trim().split('\n')[0]
    lines.push(`::error file=${t.path},line=${t.line ?? 1}::Unresolved Codex finding: ${title} (${t.comments.nodes[0]?.url})`)
  }
  for (const t of stale) lines.push(`::warning file=${t.path}::Outdated Codex thread still open; resolve it once handled (${t.comments.nodes[0]?.url})`)
  if (risk === 'high' && !state.completed) {
    ok = false
    lines.push('::error::High-risk change (money, sign-in, database, providers, proxy or CI) without a finished Codex review. Comment "@codex review" on the PR.')
  }
  if (risk === 'high' && state.completed && state.commit && env.HEAD_SHA && !env.HEAD_SHA.startsWith(state.commit.slice(0, 7))) {
    lines.push(`::notice::Codex last reviewed ${state.commit.slice(0, 7)}, not the head ${env.HEAD_SHA.slice(0, 7)}; a new review is requested when later commits touch high-risk paths.`)
  }
  return { ok, lines, open: open.length, stale: stale.length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const risk = env.RISK ?? 'high'
  const deadline = Date.now() + Number(env.WAIT_MINUTES ?? 20) * 60_000
  let state = await reviewState()
  while (risk === 'high' && !state.completed && Date.now() < deadline) {
    console.log(state.running ? 'Codex review running; waiting for it…' : 'No Codex review yet; waiting for one…')
    await new Promise((resolve) => setTimeout(resolve, 30_000))
    state = await reviewState()
  }
  const result = judge({ risk, codexThreads: await threads(), state })
  for (const line of result.lines) console.log(line)
  const summary = `### Codex findings\n\nRisk: **${risk}** · Codex review finished: **${state.completed ? `yes (${state.commit?.slice(0, 7) ?? '?'})` : 'no'}** · unresolved findings: **${result.open}** · outdated open threads: ${result.stale}\n`
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary)
  console.log(summary)
  process.exit(result.ok ? 0 : 1)
}
