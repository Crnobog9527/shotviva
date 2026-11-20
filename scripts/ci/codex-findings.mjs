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
 *   - For a high-risk change (scripts/ci/review-risk.mjs), fails until a code review of the PR has
 *     finished, and warns when the head is newer than the reviewed commit. Either reviewer counts:
 *       Codex:   a person (or the session that opened the PR, with the Owner's gh login:
 *                scripts/ci/codex-request.mjs) asks for it; Codex ignores "@codex review" from bots.
 *                While a review is still running it waits for it (up to WAIT_MINUTES), because a
 *                review without findings only edits Codex's summary comment and triggers no
 *                workflow. A failed Codex review (e.g. out of quota) blocks until a review finishes.
 *       Claude:  a GitHub PR review (COMMENTED or APPROVED) submitted by the repository owner's
 *                own account, whose body carries `<!-- claude-review:v1 commit=<sha> -->` naming
 *                the commit the review was submitted on (scripts/ci/claude-review-post.mjs posts
 *                one). Markers in issue comments, or from any other account or a bot, are ignored.
 *     Unresolved threads of an accepted Claude review block exactly like Codex threads.
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

/** The commit named by a Claude review marker, or null. */
export function parseClaudeMarker(body) {
  const match = /<!--\s*claude-review:v1\s+commit=([0-9a-f]{7,40})\s*-->/.exec(body ?? '')
  return match ? match[1] : null
}

/**
 * The PR reviews that count as a finished Claude review: submitted (COMMENTED or APPROVED) by the
 * repository owner's user account, with a marker naming the commit the review was submitted on,
 * which is a commit of the PR. Returns `{ id, commit }` (full sha) in submission order.
 */
export function claudeReviews(reviews, { repoOwner, prCommits }) {
  const accepted = []
  for (const r of reviews) {
    if (!repoOwner || r.user?.login !== repoOwner || r.user?.type !== 'User') continue
    if (r.state !== 'COMMENTED' && r.state !== 'APPROVED') continue
    const marker = parseClaudeMarker(r.body)
    if (!marker || typeof r.commit_id !== 'string' || !r.commit_id.startsWith(marker)) continue
    if (!prCommits.includes(r.commit_id)) continue
    accepted.push({ id: r.id, commit: r.commit_id })
  }
  return accepted
}

/** Whichever of the shas is latest in the PR's commit list (unknown ones rank lowest). */
export function latestCommit(shas, prCommits) {
  const rank = (sha) => prCommits.findIndex((c) => c.startsWith(sha))
  return shas.filter(Boolean).reduce((best, sha) => (best === null || rank(sha) > rank(best) ? sha : best), null)
}

/** Codex's and Claude's states merged into the one the check judges. */
export function combineStates(codex, claude, prCommits) {
  return {
    completed: codex.completed || claude.completed,
    running: codex.running,
    failed: codex.failed && !claude.completed,
    commit: latestCommit([codex.completed ? codex.commit : null, claude.commit], prCommits),
    reviewers: [codex.completed && 'Codex', claude.completed && 'Claude'].filter(Boolean),
  }
}

async function threads(claudeReviewIds = new Set()) {
  const query = `query($owner: String!, $name: String!, $pr: Int!, $after: String) {
    repository(owner: $owner, name: $name) { pullRequest(number: $pr) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { isResolved isOutdated path line
          comments(first: 1) { nodes { author { login } url body pullRequestReview { databaseId } } } }
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
  return tagThreads(all, claudeReviewIds)
}

/** Keeps the threads opened by Codex or by an accepted Claude review, tagged with who opened them. */
export function tagThreads(all, claudeReviewIds) {
  const tagged = []
  for (const thread of all) {
    const first = thread.comments.nodes[0]
    if (isCodex(first?.author?.login)) tagged.push({ ...thread, by: 'Codex' })
    else if (claudeReviewIds.has(first?.pullRequestReview?.databaseId)) tagged.push({ ...thread, by: 'Claude' })
  }
  return tagged
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

/** Every page of a REST list (100 per page). */
async function all(path) {
  const items = []
  for (let page = 1; ; page++) {
    const batch = await github(`${path}?per_page=100&page=${page}`)
    items.push(...batch)
    if (batch.length < 100) return items
  }
}

/** Codex's state alone (scripts/ci/codex-request.mjs uses it to decide whether to ask Codex). */
export async function reviewState(reviews) {
  const comments = await all(`/repos/${owner}/${name}/issues/${env.PR}/comments`)
  reviews ??= await all(`/repos/${owner}/${name}/pulls/${env.PR}/reviews`)
  return codexState(comments, reviews)
}

export function codexState(comments, reviews) {
  const summary = comments.filter((c) => isCodex(c.user?.login)).map((c) => parseReviewState(c.body)).filter(Boolean).at(-1)
  const reviewed = reviews.filter((r) => isCodex(r.user?.login)).map((r) => r.commit_id)
  // A review in progress outranks earlier ones: until it ends its findings are unknown, so the
  // check waits for it instead of passing on an older review. A failed one (e.g. Codex out of
  // quota) is not running, and does not count as finished either.
  const failed = summary?.status === 'failed'
  const running = Boolean(summary && summary.status !== 'completed' && !failed)
  return {
    completed: !running && !failed && (summary?.status === 'completed' || reviewed.length > 0),
    running,
    failed,
    commit: summary?.status === 'completed' ? summary.commit_sha : (reviewed.at(-1) ?? null),
  }
}

/** Codex's and Claude's reviews together, plus the review ids whose threads count. */
export async function fullState() {
  const reviews = await all(`/repos/${owner}/${name}/pulls/${env.PR}/reviews`)
  const prCommits = (await all(`/repos/${owner}/${name}/pulls/${env.PR}/commits`)).map((c) => c.sha)
  const codex = await reviewState(reviews)
  const accepted = claudeReviews(reviews, { repoOwner: owner, prCommits })
  const claude = { completed: accepted.length > 0, commit: latestCommit(accepted.map((r) => r.commit), prCommits) }
  return { state: combineStates(codex, claude, prCommits), claudeReviewIds: new Set(accepted.map((r) => r.id)) }
}

const titleOf = (thread) =>
  (thread.comments.nodes[0]?.body ?? '')
    .replace(/<[^>]+>|!\[[^\]]*\]\([^)]*\)|\*\*/g, '')
    .trim()
    .split('\n')[0]

export function judge({ risk, reviewThreads, state }) {
  const open = reviewThreads.filter((t) => !t.isResolved && !t.isOutdated)
  const stale = reviewThreads.filter((t) => !t.isResolved && t.isOutdated)
  const lines = []
  const table = []
  let ok = true
  for (const t of open) {
    ok = false
    const url = t.comments.nodes[0]?.url
    lines.push(`::error file=${t.path},line=${t.line ?? 1}::Unresolved ${t.by ?? 'Codex'} finding: ${titleOf(t)} (${url})`)
    table.push(`| ❌ open | ${titleOf(t)} | \`${t.path}\` | ${url} |`)
  }
  // A later commit changed those lines: maybe fixed, maybe not. Listed so the reviewer checks.
  for (const t of stale) {
    const url = t.comments.nodes[0]?.url
    lines.push(`::warning file=${t.path}::Outdated ${t.by ?? 'Codex'} finding still unresolved, check it was handled: ${titleOf(t)} (${url})`)
    table.push(`| ⚠️ outdated | ${titleOf(t)} | \`${t.path}\` | ${url} |`)
  }
  if (state.running) {
    ok = false
    lines.push('::error::A Codex review is still running; this check re-runs when it posts findings, or re-run it once Codex reacts 👍.')
  } else if (state.failed) {
    ok = false
    lines.push(
      '::error::The last Codex review failed (e.g. Codex is out of quota). Ask Codex again, or publish a Claude review ' +
        '(scripts/ci/claude-review-post.mjs).',
    )
  } else if (risk === 'high' && !state.completed) {
    ok = false
    lines.push(
      '::error::High-risk change (money, sign-in, database, providers, proxy or CI) without a finished code review. ' +
        'Comment "@codex review" on the PR from a person\'s account (Codex ignores bots), or publish a Claude review ' +
        '(scripts/ci/claude-review-post.mjs).',
    )
  }
  const head = state.head ?? env.HEAD_SHA
  if (risk === 'high' && state.completed && state.commit && head && !head.startsWith(state.commit.slice(0, 7))) {
    const who = state.reviewers?.join(' / ') || 'Codex'
    lines.push(
      `::warning::${who} last reviewed ${state.commit.slice(0, 7)}, not the head ${head.slice(0, 7)}. ` +
        'If later commits change money, sign-in, database or provider code, ask for a review of the head again.',
    )
  }
  return { ok, lines, table, open: open.length, stale: stale.length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const risk = env.RISK ?? 'high'
  const deadline = Date.now() + Number(env.WAIT_MINUTES ?? 20) * 60_000
  let { state, claudeReviewIds } = await fullState()
  while ((state.running || (risk === 'high' && !state.completed)) && Date.now() < deadline) {
    console.log(state.running ? 'Codex review running; waiting for it…' : 'No finished review yet; waiting for one…')
    await new Promise((resolve) => setTimeout(resolve, 30_000))
    ;({ state, claudeReviewIds } = await fullState())
  }
  const result = judge({ risk, reviewThreads: await threads(claudeReviewIds), state })
  for (const line of result.lines) console.log(line)
  const reviewed = state.completed ? `yes, ${state.reviewers.join(' + ')} (${state.commit?.slice(0, 7) ?? '?'})` : state.failed ? 'no (Codex failed)' : 'no'
  const rows = result.table.length ? `\n| | Finding | File | Thread |\n|---|---|---|---|\n${result.table.join('\n')}\n` : ''
  const summary = `### Codex findings\n\nRisk: **${risk}** · Review finished: **${reviewed}** · unresolved findings: **${result.open}** · outdated, unresolved: ${result.stale}\n${rows}`
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary)
  console.log(summary)
  process.exit(result.ok ? 0 : 1)
}
