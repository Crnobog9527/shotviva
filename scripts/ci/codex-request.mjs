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
 * Posts nothing while a Codex review is running or a "@codex review" was posted in the last
 * 10 minutes. Env: GH_TOKEN, REPO, PR, HEAD_SHA, ACTION (the pull_request action),
 * CODEX_REVIEW_MODE.
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
if (state.running) {
  console.log('A Codex review is already running.')
  process.exit(0)
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

const tenMinutesAgo = Date.now() - 10 * 60_000
const recent = api(`repos/${env.REPO}/issues/${env.PR}/comments?per_page=100`).some(
  (c) => /@codex review/.test(c.body ?? '') && Date.parse(c.created_at) > tenMinutesAgo,
)
if (recent) {
  console.log('"@codex review" was already asked in the last 10 minutes.')
  process.exit(0)
}

execFileSync('gh', ['pr', 'comment', String(env.PR), '--repo', env.REPO, '--body', `@codex review\n\n<sub>${why}.</sub>`])
console.log(`Asked Codex to review: ${why}.`)
