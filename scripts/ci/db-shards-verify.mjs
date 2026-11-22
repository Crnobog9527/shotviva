/**
 * The "supabase db tests" job in ci.yml: the one required result for the database stage, summed
 * up from "supabase schema" and the four "supabase db tests (k/4)" shards.
 *
 * Passes only when
 *   - the schema job and the shard matrix both succeeded;
 *   - every shard left its record (REPORT_DIR/db-shard-<k>/marker.json) for this commit, and all
 *     of them, and the schema job, made the same decision on whether the DB tests were needed;
 *   - when they were: the shards' vitest JSON reports (report.json beside each record) together
 *     list every test file under tests/db exactly once, every file and the whole of each report
 *     passed, and no test failed.
 * Anything missing or unexpected fails, so a shard that ran nothing, ran the wrong files or was
 * cancelled cannot pass as a success.
 *
 * Env: SCHEMA_RESULT, SHARDS_RESULT (job results), SCHEMA_DB (the schema job's 'true'/'false'),
 * SHARD_COUNT, REPORT_DIR, GITHUB_SHA; optional TEST_ROOT (default tests/db), GITHUB_STEP_SUMMARY.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Test files the db project includes (vitest.config.ts: tests/db/**\/*.test.ts), sorted. */
export function expectedFiles(root) {
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? walk(path) : [path]
    })
  const base = join(root, '..', '..')
  return walk(root)
    .filter((path) => path.endsWith('.test.ts'))
    .map((path) => relative(base, path).split('\\').join('/'))
    .sort()
}

/** A report's absolute file path as `tests/db/…`, or null if it is not under tests/db. */
function testPath(name) {
  const at = String(name).replaceAll('\\', '/').lastIndexOf('/tests/db/')
  return at < 0 ? null : name.replaceAll('\\', '/').slice(at + 1)
}

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * @param env  the job's env (see above)
 * @param load (shard number) => { marker, report } as read from REPORT_DIR, undefined when absent
 * @param expected the test files that must be covered
 * @returns { ok, errors, rows }
 */
export function verify(env, load, expected) {
  const errors = []
  const rows = []
  const count = Number(env.SHARD_COUNT)
  if (!Number.isInteger(count) || count < 1) return { ok: false, errors: [`bad SHARD_COUNT ${env.SHARD_COUNT}`], rows }
  if (env.SCHEMA_RESULT !== 'success') errors.push(`supabase schema: ${env.SCHEMA_RESULT || 'no result'}`)
  if (env.SHARDS_RESULT !== 'success') errors.push(`DB test shards: ${env.SHARDS_RESULT || 'no result'}`)
  if (env.SCHEMA_DB !== 'true' && env.SCHEMA_DB !== 'false') errors.push(`supabase schema made no run/skip decision (${env.SCHEMA_DB || 'empty'})`)

  const seen = new Map()
  for (let shard = 1; shard <= count; shard++) {
    const { marker, report } = load(shard) ?? {}
    const row = { shard, db: marker?.db ?? 'missing', files: 0, tests: 0, failed: 0 }
    rows.push(row)
    if (!marker) {
      errors.push(`shard ${shard}: no record`)
      continue
    }
    if (marker.shard !== shard || marker.of !== count) errors.push(`shard ${shard}: record says ${marker.shard}/${marker.of}`)
    if (marker.sha !== env.GITHUB_SHA) errors.push(`shard ${shard}: record is for ${marker.sha}, not ${env.GITHUB_SHA}`)
    if (marker.db !== env.SCHEMA_DB) errors.push(`shard ${shard}: decided db=${marker.db || 'empty'}, the schema job db=${env.SCHEMA_DB || 'empty'}`)
    if (marker.db !== 'true') continue
    if (!report || !Array.isArray(report.testResults)) {
      errors.push(`shard ${shard}: no test report`)
      continue
    }
    row.files = report.testResults.length
    row.tests = report.numTotalTests ?? 0
    row.failed = (report.numFailedTests ?? 0) + (report.numFailedTestSuites ?? 0)
    if (report.success !== true) errors.push(`shard ${shard}: the report does not say success`)
    if (report.numFailedTests !== 0 || report.numFailedTestSuites !== 0) errors.push(`shard ${shard}: ${report.numFailedTests} failed tests, ${report.numFailedTestSuites} failed files`)
    if (!(report.numTotalTests > 0)) errors.push(`shard ${shard}: ran no tests`)
    for (const result of report.testResults) {
      const path = testPath(result?.name ?? '')
      if (!path) {
        errors.push(`shard ${shard}: unexpected file ${result?.name}`)
        continue
      }
      if (result.status !== 'passed') errors.push(`shard ${shard}: ${path} ${result.status}`)
      if (seen.has(path)) errors.push(`${path} ran in shards ${seen.get(path)} and ${shard}`)
      else seen.set(path, shard)
    }
  }

  if (env.SCHEMA_DB === 'true') {
    const missing = expected.filter((path) => !seen.has(path))
    const extra = [...seen.keys()].filter((path) => !expected.includes(path))
    if (expected.length === 0) errors.push('no test files found under tests/db')
    if (missing.length > 0) errors.push(`not run in any shard (${missing.length}): ${missing.join(', ')}`)
    if (extra.length > 0) errors.push(`run but not under tests/db in this commit: ${extra.join(', ')}`)
  }
  return { ok: errors.length === 0, errors, rows }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.env
  const dir = env.REPORT_DIR ?? ''
  const load = (shard) => {
    const base = join(dir, `db-shard-${shard}`)
    if (!existsSync(base)) return undefined
    return { marker: readJson(join(base, 'marker.json')), report: readJson(join(base, 'report.json')) }
  }
  const expected = expectedFiles(env.TEST_ROOT ?? 'tests/db')
  const { ok, errors, rows } = verify(env, load, expected)
  const lines = [
    '### supabase db tests',
    '',
    `supabase schema: ${env.SCHEMA_RESULT}; shards: ${env.SHARDS_RESULT}; DB tests needed: ${env.SCHEMA_DB}`,
    '',
    '| Shard | Ran | Files | Tests | Failed |',
    '|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.shard}/${env.SHARD_COUNT} | ${row.db} | ${row.files} | ${row.tests} | ${row.failed} |`),
    '',
    `Test files under tests/db: ${expected.length}`,
    '',
    ...(ok ? ['Result: success'] : ['Result: failure', '', ...errors.map((error) => `- ${error}`)]),
    '',
  ]
  const text = lines.join('\n')
  console.log(text)
  for (const error of errors) console.log(`::error::${error}`)
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`)
  process.exit(ok ? 0 : 1)
}
