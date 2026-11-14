/**
 * Asks Codex to review a high-risk pull request, so that risky changes are always reviewed while
 * small ones are not. Run it from the session that opened or pushed to the PR, logged in to gh
 * as a person: Codex ignores "@codex review" comments from bots (github-actions[bot] was tried
 * on #666), so this cannot run in a workflow.
 *
 *   REPO=Crnobog9527/shotviva PR=123 node scripts/ci/codex-request.mjs
 *
 * HEAD_SHA defaults to the PR's head, ACTION to "synchronize" (ask when high-risk paths changed
 * since Codex's last review, or it never finished one); ACTION=opened with on-demand asks anyway.
 *
 *   CODEX_REVIEW_MODE=auto       (default) Codex's "review on open" is on in its settings, so it
 *                                reviews every new PR itself. This only asks again when commits
 *                                pushed after its last review touch high-risk paths.
 *   CODEX_REVIEW_MODE=on-demand  Codex's automatic review is off. This also asks when a
 *                                high-risk PR is opened, reopened or marked ready.
 *
 * After asking, it waits for Codex to pick the request up (up to 5 minutes; exit 4 if it does
 * not) and then re-runs the head's "Codex findings" run, which waits for the review to finish.
 * Posts nothing (exit 3: run it again later) while a Codex review is running, and nothing while
 * an earlier "@codex review" is still waiting for Codex.
 * Env: GH_TOKEN, REPO, PR, HEAD_SHA, ACTION, CODEX_REVIEW_MODE.
 */
import { execFileSync } from 'node:child_process'

import { reviewState } from './codex-findings.mjs'
import { reviewRisk } from './review-risk.mjs'

const env = process.env
env.GH_TOKEN ??= execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
env.ACTION ??= 'synchronize'
env.HEAD_SHA ??= execFileSync('gh', ['pr', 'view', String(env.PR), '--repo', env.REPO, '--json', 'headRefOid', '-q', '.headRefOid'], {
  encoding: 'utf8',
}).trim()
const api = (path) => JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', path], { encoding: 'utf8' })).flat()

const mode = env.CODEX_REVIEW_MODE === 'on-demand' ? 'on-demand' : 'auto'
const prFiles = api(`repos/${env.REPO}/pulls/${env.PR}/files?per_page=100`).map((f) => f.filename)
if (reviewRisk(prFiles) !== 'high') {
  console.log(`Not a high-risk change (${reviewRisk(prFiles)}); Codex reviews it only when asked.`)
  process.exit(0)
}

const state = await reviewState()
// Codex reviews the head it sees when it starts. A request now would be ignored or overlap, and
// nothing re-asks later (no workflow posts requests), so say so and let the caller re-run this.
if (state.running) {
  console.error('A Codex review is running. Run this again once it has finished, to cover commits pushed since it started.')
  process.exit(3)
}

let why = null
if (env.ACTION === 'synchronize') {
  if (!state.commit) {
    why = 'high-risk change without a finished Codex review'
  } else if (!env.HEAD_SHA.startsWith(state.commit)) {
    const compare = JSON.parse(
      execFileSync('gh', ['api', `repos/${env.REPO}/compare/${state.commit}...${env.HEAD_SHA}`], { encoding: 'utf8' }),
    )
    const since = (compare.files ?? []).map((f) => f.filename)
    if (compare.status === 'diverged' || reviewRisk(since) === 'high') why = `high-risk paths changed since Codex reviewed ${state.commit.slice(0, 7)}`
  }
} else if (mode === 'on-demand') {
  why = 'high-risk change opened for review'
}

if (!why) {
  console.log('Nothing new for Codex to review.')
  process.exit(0)
}

// A request newer than Codex's last update of its summary comment has not been picked up yet
// (Codex edits that comment when a review starts and ends; its 👀 goes away afterwards, so
// reactions cannot tell). Asking again would only queue a duplicate.
const comments = api(`repos/${env.REPO}/issues/${env.PR}/comments?per_page=100`)
const isCodexBot = (c) => /codex/.test(c.user?.login ?? '')
const lastCodexUpdate = Math.max(0, ...comments.filter(isCodexBot).map((c) => Date.parse(c.updated_at)))
const pending = comments.some(
  (c) => !isCodexBot(c) && /^\s*@codex review\b/.test(c.body ?? '') && Date.parse(c.created_at) > lastCodexUpdate,
)
if (pending) {
  console.log('An earlier "@codex review" has not been picked up by Codex yet.')
  process.exit(0)
}

execFileSync('gh', ['pr', 'comment', String(env.PR), '--repo', env.REPO, '--body', `@codex review\n\n<sub>${why}.</sub>`])
console.log(`Asked Codex to review: ${why}.`)

// A comment starts no check on the PR, so "Codex findings" would stay green while this review
// runs. Re-running its latest pull_request run makes it wait for the review (up to 20 minutes),
// but only once Codex has picked the request up: before that its summary still shows the previous
// review as completed, and the re-run would pass on it.
const before = state.commit
const ackDeadline = Date.now() + 5 * 60_000
let acked = false
while (Date.now() < ackDeadline) {
  const now = await reviewState()
  if (now.running || (now.completed && now.commit && now.commit !== before)) {
    acked = true
    break
  }
  await new Promise((resolve) => setTimeout(resolve, 15_000))
}
if (!acked) {
  console.error('Codex has not picked up the request after 5 minutes; re-run "Codex findings" by hand once it reacts 👀.')
  process.exit(4)
}
const runs = JSON.parse(
  execFileSync('gh', ['run', 'list', '--repo', env.REPO, '--workflow', 'codex-review.yml', '--event', 'pull_request',
    '--commit', env.HEAD_SHA, '--limit', '1', '--json', 'databaseId,status'], { encoding: 'utf8' }),
)
if (runs[0]?.status === 'completed') {
  execFileSync('gh', ['run', 'rerun', String(runs[0].databaseId), '--repo', env.REPO])
  console.log(`Re-ran "Codex findings" (run ${runs[0].databaseId}); it now waits for this review.`)
} else if (!runs[0]) {
  console.warn('No "Codex findings" run for the head yet; it will wait for the review when it starts.')
}
