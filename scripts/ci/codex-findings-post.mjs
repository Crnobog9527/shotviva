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

const { ok, lines, summary } = await evaluate()
for (const line of lines) console.log(line)
const text = `${summary}\n${lines.map((l) => `- ${l.replace(/^::(\w+)[^:]*::/, '**$1**: ')}`).join('\n')}\n`
const response = await fetch(`https://api.github.com/repos/${env.REPO}/check-runs`, {
  method: 'POST',
  headers: { authorization: `Bearer ${env.GH_TOKEN}`, accept: 'application/vnd.github+json' },
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
