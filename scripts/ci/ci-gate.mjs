/**
 * The "CI gate" job in ci.yml: one result for the whole run, and the record of why Lighthouse ran
 * or was skipped, page by page (log and job summary).
 *
 * Passes when the checks and the DB tests passed and Lighthouse passed or was not needed. The
 * Lighthouse decision itself is the `if:` of the lighthouse jobs; `lighthouseDecision` explains
 * it in the same order, from the same inputs.
 *
 * Env: CHECKS, DB, LIGHTHOUSE, BASE (job results); CODE, FORCE, REASON (change detection);
 * PAGES, BASE_PAGES (fingerprints per page, JSON); EVENT.
 */
import { appendFileSync } from 'node:fs'

const parse = (json) => {
  try {
    return json ? JSON.parse(json) : null
  } catch {
    return null
  }
}

/** Pages whose fingerprint differs from the base's (every page when one side is missing). */
export function changedPages(pages, base) {
  const names = [...new Set([...Object.keys(pages ?? {}), ...Object.keys(base ?? {})])].sort()
  return names.map((name) => ({ name, changed: !pages || !base || pages[name] !== base[name] }))
}

export function lighthouseDecision(env) {
  const pages = parse(env.PAGES)
  const base = parse(env.BASE_PAGES)
  const rows = pages || base ? changedPages(pages, base) : []
  const changed = rows.filter((row) => row.changed).map((row) => row.name)
  let why
  if (env.EVENT === 'push') why = 'not run on pushes to main'
  else if (env.CHECKS !== 'success') why = 'not run: lint · typecheck · test · build did not pass'
  else if (env.CODE !== 'true') why = 'not needed: docs-only change'
  else if (env.BASE !== 'success') why = `run: the baseline job did not finish (${env.BASE}), so nothing to compare`
  else if (env.FORCE !== 'false') why = `run: forced (${env.REASON || 'unknown reason'})`
  else if (!pages || !base) why = 'run: a fingerprint is missing'
  else if (changed.length > 0) why = `run: changed ${changed.join(', ')}`
  else why = 'skipped: all pages and public/ send the same bytes as on the base commit'
  return { why, rows }
}

export function gate(env) {
  const lighthouseOk = env.LIGHTHOUSE === 'success' || env.LIGHTHOUSE === 'skipped'
  return env.CHECKS === 'success' && env.DB === 'success' && lighthouseOk
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.env
  const { why, rows } = lighthouseDecision(env)
  const lines = [
    '### CI gate',
    '',
    `| Job | Result |`,
    `|---|---|`,
    `| lint · typecheck · test · build | ${env.CHECKS} |`,
    `| supabase db tests | ${env.DB} |`,
    `| lighthouse | ${env.LIGHTHOUSE} — ${why} |`,
    '',
  ]
  if (rows.length > 0) {
    lines.push('| Lighthouse page | vs base |', '|---|---|')
    for (const row of rows) lines.push(`| \`${row.name}\` | ${row.changed ? 'changed' : 'same'} |`)
    lines.push('')
  }
  const text = lines.join('\n')
  console.log(text)
  console.log(`::notice::Lighthouse ${why}`)
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`)
  process.exit(gate(env) ? 0 : 1)
}
