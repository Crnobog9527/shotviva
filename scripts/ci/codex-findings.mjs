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
 *                own account, whose body carries `<!-- claude-review:v1 commit=<sha> reviewer=<label> -->`
 *                naming the commit the review was submitted on (scripts/ci/claude-review-post.mjs
 *                posts one; `reviewer=` is optional, for audit, and shown in the summary). It must
 *                come from a reviewer session separate from the PR's author. Markers in issue
 *                comments, or from any other account or a bot, are ignored. A failed Codex review
 *                is cleared only by a Claude review of that commit or a later one.
 *     Unresolved threads of any Claude review by the owner block exactly like Codex threads, even
 *     after its commit left the PR (force-push) or the commit list (GitHub lists 250 at most).
 *   - Carries a review over to the head when only scripts/ci/schema-commit.sh's bot commits
 *     (supabase/schema.sql alone, see schemaCarry) came after the reviewed commit: no head-is-newer
 *     warning. That push starts no workflow, so the ci.yml job after it posts this check on the
 *     new commit (scripts/ci/codex-findings-post.mjs). Thread rules are the same either way.
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

const MARKER = /<!--\s*claude-review:v1\s+commit=([0-9a-f]{7,40})(?:\s+reviewer=([\w.:@/-]{1,80}))?\s*-->/

/** The commit named by a Claude review marker, or null. */
export function parseClaudeMarker(body) {
  return MARKER.exec(body ?? '')?.[1] ?? null
}

/** The optional `reviewer=` label of a Claude review marker, or null. */
export function parseClaudeReviewer(body) {
  return MARKER.exec(body ?? '')?.[2] ?? null
}

const sameLogin = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length > 0 && a.toLowerCase() === b.toLowerCase()

/** A review by the owner's user account whose marker names the commit it was submitted on. */
const ownerMarked = (r, repoOwner) => {
  if (!sameLogin(r.user?.login, repoOwner) || r.user?.type !== 'User') return false
  const marker = parseClaudeMarker(r.body)
  return Boolean(marker && typeof r.commit_id === 'string' && r.commit_id.startsWith(marker))
}

/**
 * Ids of the owner's marked reviews whose threads block, whatever their state or commit: a
 * force-push or the 250-commit cap of the commits API must not let their findings stop counting.
 */
export function claudeThreadReviewIds(reviews, { repoOwner }) {
  return new Set(reviews.filter((r) => ownerMarked(r, repoOwner)).map((r) => r.id))
}

/**
 * The PR reviews that count as a finished Claude review: submitted (COMMENTED or APPROVED) by the
 * repository owner's user account, with a marker naming the commit the review was submitted on,
 * which is a commit of the PR. Returns `{ id, commit, reviewer }` (full sha) in submission order.
 */
export function claudeReviews(reviews, { repoOwner, prCommits }) {
  return reviews
    .filter((r) => ownerMarked(r, repoOwner) && (r.state === 'COMMENTED' || r.state === 'APPROVED') && prCommits.includes(r.commit_id))
    .map((r) => ({ id: r.id, commit: r.commit_id, reviewer: parseClaudeReviewer(r.body) }))
}

/** Position of a (possibly short) sha in the PR's commit list, -1 when unknown. */
export const commitRank = (sha, prCommits) => (sha ? prCommits.findIndex((c) => c.startsWith(sha)) : -1)

/** Whichever of the shas is latest in the PR's commit list (unknown ones rank lowest). */
export function latestCommit(shas, prCommits) {
  const rank = (sha) => commitRank(sha, prCommits)
  return shas.filter(Boolean).reduce((best, sha) => (best === null || rank(sha) > rank(best) ? sha : best), null)
}

/** Codex's and Claude's states merged into the one the check judges. */
export function combineStates(codex, claude, prCommits) {
  // A Claude review clears a failed Codex review only if it covers that commit or a later one.
  const claudeRank = claude.completed ? commitRank(claude.commit, prCommits) : -1
  const clears = claudeRank >= 0 && claudeRank >= commitRank(codex.failedCommit, prCommits)
  return {
    completed: codex.completed || claude.completed,
    running: codex.running,
    failed: Boolean(codex.failed) && !clears,
    claudeReviewers: claude.reviewers ?? [],
    commit: latestCommit([codex.completed ? codex.commit : null, claude.commit], prCommits),
    reviewers: [codex.completed && 'Codex', claude.completed && 'Claude'].filter(Boolean),
  }
}

/** The commit scripts/ci/schema-commit.sh pushes: author, committer, first message line, file. */
export const SCHEMA_BOT = 'github-actions[bot]'
const SCHEMA_BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com'
export const SCHEMA_MARKER = 'chore(db): regenerate schema.sql [auto]'
export const SCHEMA_FILE = 'supabase/schema.sql'
const MAX_CARRIED = 10

const isSha = (sha, min = 7) => typeof sha === 'string' && sha.length >= min && /^[0-9a-f]+$/.test(sha)
const onlySchema = (files) =>
  Array.isArray(files) && files.length === 1 && files[0].filename === SCHEMA_FILE && files[0].status === 'modified' && !files[0].previous_filename

/**
 * Whether a review of `reviewed` holds for `head`: every commit between them is a bot commit of
 * scripts/ci/schema-commit.sh (both author and committer the github-actions bot, first message line
 * exactly the [auto] marker, one parent, changing supabase/schema.sql and nothing else). Takes the
 * compare API's `reviewed...head` response and each commit's own file list (`filesOf(sha)`).
 * Returns `{ carried, reason }`; anything unexpected is not carried (fail closed).
 */
export function schemaCarry({ reviewed, head, compare, filesOf }) {
  const no = (reason) => ({ carried: false, reason })
  if (!isSha(reviewed) || !isSha(head, 40)) return no('unknown commits')
  if (head.startsWith(reviewed)) return no('same commit')
  const commits = compare?.commits
  if (compare?.status !== 'ahead' || compare.behind_by !== 0 || !Array.isArray(commits)) return no('head does not descend from the reviewed commit')
  if (commits.length === 0 || commits.length > MAX_CARRIED || compare.ahead_by !== commits.length) return no('unexpected number of commits')
  const base = compare.merge_base_commit?.sha
  if (!isSha(base, 40) || !base.startsWith(reviewed)) return no('the reviewed commit is not the base')
  if (commits.at(-1).sha !== head) return no('the compare does not end at the head')
  if (!onlySchema(compare.files)) return no(`the commits change more than ${SCHEMA_FILE}`)
  let parent = base
  for (const c of commits) {
    const short = c.sha?.slice(0, 7)
    if (c.parents?.length !== 1 || c.parents[0].sha !== parent) return no(`${short} is a merge or out of line`)
    if (c.author?.login !== SCHEMA_BOT || c.committer?.login !== SCHEMA_BOT) return no(`${short} is not by ${SCHEMA_BOT}`)
    const meta = c.commit ?? {}
    if (meta.author?.email !== SCHEMA_BOT_EMAIL || meta.committer?.email !== SCHEMA_BOT_EMAIL) return no(`${short} is not by ${SCHEMA_BOT}`)
    if (typeof meta.message !== 'string' || meta.message.split('\n')[0] !== SCHEMA_MARKER) return no(`${short} is not an [auto] schema commit`)
    if (!onlySchema(filesOf(c.sha))) return no(`${short} changes more than ${SCHEMA_FILE}`)
    parent = c.sha
  }
  return { carried: true, reason: `${commits.length} [auto] schema.sql commit(s) since ${reviewed.slice(0, 7)}` }
}

/** schemaCarry with its data read from GitHub (`get` = one REST GET returning JSON). */
export async function carriedOver({ repo, reviewed, head, get }) {
  if (!isSha(reviewed) || !isSha(head, 40) || head.startsWith(reviewed)) return schemaCarry({ reviewed, head })
  const compare = await get(`/repos/${repo}/compare/${reviewed}...${head}`)
  const files = new Map()
  for (const c of (compare?.commits ?? []).slice(0, MAX_CARRIED)) files.set(c.sha, (await get(`/repos/${repo}/commits/${c.sha}`)).files)
  return schemaCarry({ reviewed, head, compare, filesOf: (sha) => files.get(sha) })
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

/** Keeps the threads opened by Codex or by an owner's Claude review, tagged with who opened them. */
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
    failedCommit: failed ? (summary.commit_sha ?? null) : null,
    commit: summary?.status === 'completed' ? summary.commit_sha : (reviewed.at(-1) ?? null),
  }
}

/** Codex's and Claude's reviews together, plus the review ids whose threads count. */
export async function fullState({ repo = env.REPO ?? '', pr = env.PR, list = all, get = github, head = env.HEAD_SHA } = {}) {
  const [repoOwner] = repo.split('/')
  const base = `/repos/${repo}`
  const reviews = await list(`${base}/pulls/${pr}/reviews`)
  // GitHub lists at most 250 commits here; a review of a commit beyond that does not count as
  // finished (fail closed), but its threads still block (claudeThreadReviewIds).
  const prCommits = (await list(`${base}/pulls/${pr}/commits`)).map((c) => c.sha)
  const codex = codexState(await list(`${base}/issues/${pr}/comments`), reviews)
  const accepted = claudeReviews(reviews, { repoOwner, prCommits })
  const claude = {
    completed: accepted.length > 0,
    commit: latestCommit(accepted.map((r) => r.commit), prCommits),
    reviewers: [...new Set(accepted.map((r) => r.reviewer).filter(Boolean))],
  }
  const state = combineStates(codex, claude, prCommits)
  // A review of an earlier commit holds for the head when only schema-commit.sh's bot commits
  // came after it (schemaCarry); otherwise the head-is-newer warning stays.
  let carry = { carried: false }
  if (state.completed && state.commit && head) {
    try {
      carry = await carriedOver({ repo, reviewed: state.commit, head, get })
    } catch (error) {
      carry = { carried: false, reason: `could not compare: ${error.message.slice(0, 200)}` }
    }
  }
  return { state: { ...state, head, carried: carry.carried, carryReason: carry.reason }, claudeReviewIds: claudeThreadReviewIds(reviews, { repoOwner }) }
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
  if (state.carried) {
    lines.push(`::notice::Review of ${state.commit.slice(0, 7)} carried over to the head ${head?.slice(0, 7)}: ${state.carryReason}.`)
  } else if (risk === 'high' && state.completed && state.commit && head && !head.startsWith(state.commit.slice(0, 7))) {
    const who = state.reviewers?.join(' / ') || 'Codex'
    lines.push(
      `::warning::${who} last reviewed ${state.commit.slice(0, 7)}, not the head ${head.slice(0, 7)}. ` +
        'If later commits change money, sign-in, database or provider code, ask for a review of the head again.',
    )
  }
  return { ok, lines, table, open: open.length, stale: stale.length }
}

/**
 * Runs the whole check: waits (up to waitMinutes) for a running or missing review, then judges.
 * Returns `{ ok, lines, summary }`; the CLI below and scripts/ci/codex-findings-post.mjs use it.
 */
export async function evaluate({ risk = env.RISK ?? 'high', waitMinutes = Number(env.WAIT_MINUTES ?? 20), log = console.log } = {}) {
  const deadline = Date.now() + waitMinutes * 60_000
  let { state, claudeReviewIds } = await fullState()
  while ((state.running || (risk === 'high' && !state.completed)) && Date.now() < deadline) {
    log(state.running ? 'Codex review running; waiting for it…' : 'No finished review yet; waiting for one…')
    await new Promise((resolve) => setTimeout(resolve, 30_000))
    ;({ state, claudeReviewIds } = await fullState())
  }
  const result = judge({ risk, reviewThreads: await threads(claudeReviewIds), state })
  const carried = state.carried ? ` (carried to ${state.head.slice(0, 7)}: ${state.carryReason})` : ''
  const reviewed = state.completed ? `yes, ${state.reviewers.join(' + ')} (${state.commit?.slice(0, 7) ?? '?'})${carried}` : state.failed ? 'no (Codex failed)' : 'no'
  const rows = result.table.length ? `\n| | Finding | File | Thread |\n|---|---|---|---|\n${result.table.join('\n')}\n` : ''
  const by = state.claudeReviewers.length ? ` · Claude reviewer: ${state.claudeReviewers.join(', ')}` : ''
  const summary = `### Codex findings\n\nRisk: **${risk}** · Review finished: **${reviewed}**${by} · unresolved findings: **${result.open}** · outdated, unresolved: ${result.stale}\n${rows}`
  return { ok: result.ok, lines: result.lines, summary }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, lines, summary } = await evaluate()
  for (const line of lines) console.log(line)
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary)
  console.log(summary)
  process.exit(ok ? 0 : 1)
}
