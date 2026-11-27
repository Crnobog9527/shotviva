/**
 * The "lint · typecheck · test · build" job in ci.yml: the sum of the lint, typecheck, unit tests
 * and build jobs. Passes only when all four ran and succeeded and made the same decision on
 * whether the commit has code to check (.github/actions/changes `code`); a missing job, a skip,
 * a cancellation or a disagreement fails.
 *
 * Env: RESULTS, the workflow's `toJSON(needs)`; optional GITHUB_STEP_SUMMARY.
 */
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const PARTS = ['lint', 'typecheck', 'unit', 'build']

export function verify(needs) {
  const errors = []
  const rows = PARTS.map((part) => ({ part, result: needs?.[part]?.result ?? 'missing', code: needs?.[part]?.outputs?.code ?? '' }))
  for (const row of rows) {
    if (row.result !== 'success') errors.push(`${row.part}: ${row.result}`)
    if (row.code !== 'true' && row.code !== 'false') errors.push(`${row.part}: no code/docs-only decision (${row.code || 'empty'})`)
  }
  const decisions = new Set(rows.map((row) => row.code))
  if (decisions.size > 1) errors.push(`the parts disagree on whether there is code to check: ${rows.map((row) => `${row.part}=${row.code || 'empty'}`).join(', ')}`)
  return { ok: errors.length === 0, errors, rows }
}

// Compared as URLs, so a path with spaces or non-ASCII never skips the check and exits 0.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  let needs
  try {
    needs = JSON.parse(process.env.RESULTS ?? '')
  } catch {
    needs = null
  }
  const { ok, errors, rows } = verify(needs)
  const text = [
    '### lint · typecheck · test · build',
    '',
    '| Part | Result | Code to check |',
    '|---|---|---|',
    ...rows.map((row) => `| ${row.part} | ${row.result} | ${row.code || '—'} |`),
    '',
    ok ? 'Result: success' : ['Result: failure', '', ...errors.map((error) => `- ${error}`)].join('\n'),
    '',
  ].join('\n')
  console.log(text)
  for (const error of errors) console.log(`::error::${error}`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
  process.exit(ok ? 0 : 1)
}
