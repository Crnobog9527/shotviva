/**
 * Publishes a Claude code review on a pull request, in the form the "Codex findings" check
 * (scripts/ci/codex-findings.mjs) accepts in place of a finished Codex review: one GitHub PR
 * review (event COMMENT), submitted on a named commit by the repository owner's account, whose
 * body carries `<!-- claude-review:v1 commit=<sha> -->`. Each finding becomes an inline comment,
 * so an unresolved one blocks the merge exactly like a Codex thread (fix it, or resolve + reply).
 *
 *   REPO=Crnobog9527/shotviva PR=123 node scripts/ci/claude-review-post.mjs findings.json [--dry-run]
 *
 * findings.json:
 *   {
 *     "commit": "<sha>",            // optional, defaults to the PR head; must be a commit of the PR
 *     "summary": "markdown",        // what was reviewed and the verdict
 *     "findings": [
 *       { "path": "src/a.ts", "line": 12, "start_line": 10, "severity": "P1",
 *         "title": "One-line claim", "body": "Why, and the failure scenario" }
 *     ]
 *   }
 *
 * A finding whose line is not in the PR's diff cannot be an inline comment; it is listed in the
 * review body instead (and then does not block: say so in the summary or fix it before merging).
 * --dry-run prints the review it would post and posts nothing.
 * Env: GH_TOKEN (default: `gh auth token`), REPO, PR.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const MARKER = (commit) => `<!-- claude-review:v1 commit=${commit} -->`

/** Right-side line numbers a review comment may sit on, from a unified-diff patch. */
export function commentableLines(patch) {
  const lines = new Set()
  let line = 0
  for (const row of (patch ?? '').split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row)
    if (hunk) {
      line = Number(hunk[1])
      continue
    }
    if (row.startsWith('-') || row.startsWith('\\')) continue
    if (row.startsWith('+') || row.startsWith(' ')) lines.add(line++)
  }
  return lines
}

const findingTitle = (f) => `**<sub>${f.severity ?? 'P2'}</sub> ${String(f.title ?? '').trim()}**`

/**
 * The REST payload for POST /pulls/{n}/reviews, plus the findings that could not go inline.
 * @typedef {{ path: string, line: number, start_line?: number, severity?: string, title: string, body?: string }} Finding
 * @param {{ commit: string, summary?: string, findings?: Finding[] }} input
 * @param {{ filename: string, patch?: string }[]} files
 */
export function buildReview({ commit, summary, findings = [] }, files) {
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error(`commit must be a full 40-character sha, got ${commit}`)
  const byPath = new Map(files.map((f) => [f.filename, commentableLines(f.patch)]))
  const comments = []
  const outside = []
  for (const f of findings) {
    if (!f.path || !Number.isInteger(f.line) || !f.title) throw new Error(`finding needs path, line and title: ${JSON.stringify(f)}`)
    const lines = byPath.get(f.path)
    const start = Number.isInteger(f.start_line) && f.start_line < f.line ? f.start_line : null
    const inDiff = lines?.has(f.line) && (start === null || lines.has(start))
    const text = `${findingTitle(f)}\n\n${String(f.body ?? '').trim()}`.trim()
    if (!inDiff) {
      outside.push(f)
      continue
    }
    comments.push({ path: f.path, line: f.line, side: 'RIGHT', ...(start !== null && { start_line: start, start_side: 'RIGHT' }), body: text })
  }
  const parts = [MARKER(commit), '### Claude review', '', `**Reviewed commit:** \`${commit.slice(0, 10)}\``, '', String(summary ?? '').trim()]
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
  if (!env.REPO || !env.PR || !file) {
    console.error('Usage: REPO=owner/name PR=123 node scripts/ci/claude-review-post.mjs findings.json [--dry-run]')
    process.exit(2)
  }
  const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input })
  const api = (path) => JSON.parse(gh(['api', '--paginate', '--slurp', path])).flat()
  const input = JSON.parse(readFileSync(file, 'utf8'))
  const [repoOwner] = env.REPO.split('/')
  const viewer = JSON.parse(gh(['api', 'user'])).login
  if (viewer !== repoOwner) {
    console.error(`gh is logged in as ${viewer}; the check only accepts Claude reviews from the repository owner ${repoOwner}.`)
    if (!dryRun) process.exit(2)
  }
  const pr = JSON.parse(gh(['api', `repos/${env.REPO}/pulls/${env.PR}`]))
  const prCommits = api(`repos/${env.REPO}/pulls/${env.PR}/commits?per_page=100`).map((c) => c.sha)
  const commit = input.commit ? prCommits.find((c) => c.startsWith(input.commit)) : pr.head.sha
  if (!commit) {
    console.error(`${input.commit} is not a commit of PR #${env.PR}.`)
    process.exit(2)
  }
  if (commit !== pr.head.sha) {
    // The files API shows the head's diff; lines may have moved since the reviewed commit.
    console.warn(`Reviewing ${commit.slice(0, 7)}, not the head ${pr.head.sha.slice(0, 7)}: inline lines are checked against the head's diff.`)
  }
  const files = api(`repos/${env.REPO}/pulls/${env.PR}/files?per_page=100`)
  const { payload, outside } = buildReview({ ...input, commit }, files)
  for (const f of outside) console.warn(`Not in the diff, listed in the body instead: ${f.path}:${f.line} ${f.title}`)
  if (dryRun) {
    console.log(`Dry run: would post this review on ${env.REPO}#${env.PR} as ${viewer}:\n`)
    console.log(JSON.stringify(payload, null, 2))
    process.exit(0)
  }
  const posted = JSON.parse(gh(['api', '--method', 'POST', `repos/${env.REPO}/pulls/${env.PR}/reviews`, '--input', '-'], JSON.stringify(payload)))
  console.log(`Posted Claude review ${posted.id} on ${commit.slice(0, 7)} with ${payload.comments.length} inline finding(s): ${posted.html_url}`)
}
