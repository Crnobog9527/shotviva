/**
 * Publishes a Claude code review on a pull request, in the form the "Codex findings" check
 * (scripts/ci/codex-findings.mjs) accepts in place of a finished Codex review: one GitHub PR
 * review (event COMMENT), submitted on a named commit by the repository owner's account, whose
 * body carries `<!-- claude-review:v1 commit=<sha> reviewer=<label> -->`. Each finding becomes an
 * inline comment, so an unresolved one blocks the merge exactly like a Codex thread (fix it, or
 * resolve + reply). Run it from a reviewer session separate from the PR's author, never from the
 * session that wrote the change: the check cannot tell them apart (same owner login), the
 * `reviewer` label is the audit trail.
 *
 *   REPO=Crnobog9527/shotviva PR=123 node scripts/ci/claude-review-post.mjs findings.json [flags]
 *
 *   --dry-run         print the review it would post, post nothing
 *   --non-head        allow reviewing a commit older than the head (lines checked against that
 *                     commit's diff from the base)
 *   --allow-outside   allow P0/P1 findings whose line is not in the diff (they go into the body,
 *                     where they do not block the check); otherwise the script refuses
 *
 * findings.json:
 *   {
 *     "reviewer": "control/opus-reviewer-1",  // required: the reviewing session or agent
 *     "commit": "<sha>",            // optional, defaults to the PR head; must be a commit of the PR
 *     "summary": "markdown",        // what was reviewed and the verdict
 *     "findings": [
 *       { "path": "src/a.ts", "line": 12, "start_line": 10, "severity": "P1",
 *         "title": "One-line claim", "body": "Why, and the failure scenario" }
 *     ]
 *   }
 *
 * A finding whose line is not in the PR's diff cannot be an inline comment; a P2/P3 one is listed
 * in the review body instead (and then does not block). `start_line` must be in the same diff hunk
 * as `line`, or the comment is placed on `line` alone.
 * Env: GH_TOKEN (default: `gh auth token`), REPO, PR.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const REVIEWER = /^[\w.:@/-]{1,80}$/
const MARKER = (commit, reviewer) => `<!-- claude-review:v1 commit=${commit} reviewer=${reviewer} -->`

/** Right-side line numbers a review comment may sit on, from a unified-diff patch → hunk index. */
export function commentableLines(patch) {
  const lines = new Map()
  let line = 0
  let hunkIndex = -1
  for (const row of (patch ?? '').split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row)
    if (hunk) {
      line = Number(hunk[1])
      hunkIndex++
      continue
    }
    if (row.startsWith('-') || row.startsWith('\\')) continue
    if (row.startsWith('+') || row.startsWith(' ')) lines.set(line++, hunkIndex)
  }
  return lines
}

const blocking = (f) => /^P[01]$/i.test(String(f.severity ?? 'P2'))

const findingTitle = (f) => `**<sub>${f.severity ?? 'P2'}</sub> ${String(f.title ?? '').trim()}**`

/**
 * The REST payload for POST /pulls/{n}/reviews, plus the findings that could not go inline.
 * @typedef {{ path: string, line: number, start_line?: number, severity?: string, title: string, body?: string }} Finding
 * @param {{ commit: string, reviewer: string, summary?: string, findings?: Finding[] }} input
 * @param {{ filename: string, patch?: string }[]} files
 * @param {{ allowOutside?: boolean }} [options]
 */
export function buildReview({ commit, reviewer, summary, findings = [] }, files, { allowOutside = false } = {}) {
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error(`commit must be a full 40-character sha, got ${commit}`)
  if (!REVIEWER.test(reviewer ?? '')) throw new Error('reviewer must name the reviewing session or agent (letters, digits, . _ : @ / -)')
  const byPath = new Map(files.map((f) => [f.filename, commentableLines(f.patch)]))
  const comments = []
  const outside = []
  for (const f of findings) {
    if (!f.path || !Number.isInteger(f.line) || !f.title) throw new Error(`finding needs path, line and title: ${JSON.stringify(f)}`)
    const lines = byPath.get(f.path)
    const inDiff = Boolean(lines?.has(f.line))
    // A range must stay inside one hunk, or GitHub rejects the whole review (422).
    const start =
      inDiff && Number.isInteger(f.start_line) && f.start_line < f.line && lines.get(f.start_line) === lines.get(f.line) ? f.start_line : null
    const text = `${findingTitle(f)}\n\n${String(f.body ?? '').trim()}`.trim()
    if (!inDiff) {
      outside.push(f)
      continue
    }
    comments.push({ path: f.path, line: f.line, side: 'RIGHT', ...(start !== null && { start_line: start, start_side: 'RIGHT' }), body: text })
  }
  const refused = outside.filter(blocking)
  if (refused.length && !allowOutside) {
    const where = refused.map((f) => `${f.path}:${f.line}`).join(', ')
    throw new Error(`P0/P1 findings outside the diff would not block the check: ${where}. Move them to a diff line, or pass --allow-outside.`)
  }
  const parts = [
    MARKER(commit, reviewer),
    '### Claude review',
    '',
    `**Reviewed commit:** \`${commit.slice(0, 10)}\` · **Reviewer:** ${reviewer}`,
    '',
    String(summary ?? '').trim(),
  ]
  parts.push('', findings.length ? `Findings: ${findings.length} (${comments.length} inline).` : 'No findings.')
  if (outside.length) {
    parts.push('', '#### Findings outside the diff (not inline, do not block the check)')
    for (const f of outside) parts.push(`- ${findingTitle(f)} \`${f.path}:${f.line}\`: ${String(f.body ?? '').trim()}`)
  }
  return { payload: { commit_id: commit, event: 'COMMENT', body: parts.join('\n').trim(), comments }, outside }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.env
  const [file, ...flags] = process.argv.slice(2)
  const dryRun = flags.includes('--dry-run')
  const unknown = flags.filter((f) => !['--dry-run', '--non-head', '--allow-outside'].includes(f))
  if (unknown.length) {
    console.error(`Unknown flag(s): ${unknown.join(' ')}`)
    process.exit(2)
  }
  if (!env.REPO || !env.PR || !file) {
    console.error('Usage: REPO=owner/name PR=123 node scripts/ci/claude-review-post.mjs findings.json [--dry-run]')
    process.exit(2)
  }
  const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input })
  const api = (path) => JSON.parse(gh(['api', '--paginate', '--slurp', path])).flat()
  const input = JSON.parse(readFileSync(file, 'utf8'))
  const [repoOwner] = env.REPO.split('/')
  const viewer = JSON.parse(gh(['api', 'user'])).login
  if (viewer.toLowerCase() !== repoOwner.toLowerCase()) {
    console.error(`gh is logged in as ${viewer}; the check only accepts Claude reviews from the repository owner ${repoOwner}.`)
    if (!dryRun) process.exit(2)
  }
  const pr = JSON.parse(gh(['api', `repos/${env.REPO}/pulls/${env.PR}`]))
  // GitHub lists at most 250 commits of a PR; an older commit cannot be reviewed through this.
  const prCommits = api(`repos/${env.REPO}/pulls/${env.PR}/commits?per_page=100`).map((c) => c.sha)
  const commit = input.commit ? prCommits.find((c) => c.startsWith(input.commit)) : pr.head.sha
  if (!commit) {
    console.error(`${input.commit} is not a commit of PR #${env.PR}.`)
    process.exit(2)
  }
  let files
  if (commit === pr.head.sha) {
    files = api(`repos/${env.REPO}/pulls/${env.PR}/files?per_page=100`)
  } else if (flags.includes('--non-head')) {
    // The PR files API shows the head's diff; lines are placed against the reviewed commit's own.
    files = JSON.parse(gh(['api', `repos/${env.REPO}/compare/${pr.base.sha}...${commit}`])).files ?? []
    console.warn(`Reviewing ${commit.slice(0, 7)}, not the head ${pr.head.sha.slice(0, 7)}; the check will warn that the head is newer.`)
  } else {
    console.error(`${commit.slice(0, 7)} is not the head ${pr.head.sha.slice(0, 7)}. Review the head, or pass --non-head.`)
    process.exit(2)
  }
  let built
  try {
    built = buildReview({ ...input, commit }, files, { allowOutside: flags.includes('--allow-outside') })
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
  const { payload, outside } = built
  for (const f of outside) console.warn(`Not in the diff, listed in the body instead: ${f.path}:${f.line} ${f.title}`)
  if (dryRun) {
    console.log(`Dry run: would post this review on ${env.REPO}#${env.PR} as ${viewer}:\n`)
    console.log(JSON.stringify(payload, null, 2))
    process.exit(0)
  }
  const posted = JSON.parse(gh(['api', '--method', 'POST', `repos/${env.REPO}/pulls/${env.PR}/reviews`, '--input', '-'], JSON.stringify(payload)))
  console.log(`Posted Claude review ${posted.id} on ${commit.slice(0, 7)} with ${payload.comments.length} inline finding(s): ${posted.html_url}`)
}
