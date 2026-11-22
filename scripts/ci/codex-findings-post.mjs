/**
 * Posts the "Codex findings" check on a commit that no workflow run covers: the schema.sql commit
 * scripts/ci/schema-commit.sh pushes with GITHUB_TOKEN, which starts no run (the `codex-findings`
 * job in ci.yml). Runs the same evaluation as .github/workflows/codex-review.yml, from main's copy
 * of the scripts, against HEAD_SHA, and posts its real result, pass or fail; it never copies an
 * earlier result. A later review event re-runs the workflow, whose newer check run replaces this.
 *
 * Env: as scripts/ci/codex-findings.mjs (GH_TOKEN with checks: write and pull-requests: read,
 * REPO, PR, HEAD_SHA, RISK, WAIT_MINUTES), plus RUN_URL.
 */
import { appendFileSync } from 'node:fs'

import { evaluate } from './codex-findings.mjs'

const env = process.env
if (!/^[0-9a-f]{40}$/.test(env.HEAD_SHA ?? '')) throw new Error('HEAD_SHA must be a full commit sha')

const { ok, lines, summary, readAt } = await evaluate()
for (const line of lines) console.log(line)
const headers = { authorization: `Bearer ${env.GH_TOKEN}`, accept: 'application/vnd.github+json' }
// A codex-review.yml run (a review or thread event) that posted after this read the state judged
// newer data: never overwrite it with this result.
const existing = await fetch(
  `https://api.github.com/repos/${env.REPO}/commits/${env.HEAD_SHA}/check-runs?check_name=${encodeURIComponent('Codex findings')}&filter=all&per_page=100`,
  { headers },
)
if (!existing.ok) throw new Error(`check-runs list: ${existing.status} ${await existing.text()}`)
if ((await existing.json()).check_runs.some((run) => new Date(run.started_at ?? run.completed_at ?? 0) > readAt)) {
  console.log('::notice::A newer "Codex findings" check is already on this commit; not posting.')
  process.exit(0)
}
const text = `${summary}\n${lines.map((l) => `- ${l.replace(/^::(\w+)[^:]*::/, '**$1**: ')}`).join('\n')}\n`
const response = await fetch(`https://api.github.com/repos/${env.REPO}/check-runs`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: 'Codex findings',
    head_sha: env.HEAD_SHA,
    status: 'completed',
    conclusion: ok ? 'success' : 'failure',
    details_url: env.RUN_URL,
    output: { title: `Codex findings: ${ok ? 'success' : 'failure'}`, summary: text.slice(0, 65_000) },
  }),
})
if (!response.ok) throw new Error(`check-runs: ${response.status} ${await response.text()}`)
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary)
console.log(summary)
