import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { expectedFiles, verify } from './db-shards-verify.mjs'

// "supabase db tests" sums up the schema job and the four shards (ci.yml): no shard failure,
// skip, gap or overlap may come out as success.
const SHA = 'a'.repeat(40)
const FILES = ['tests/db/a.test.ts', 'tests/db/b.test.ts', 'tests/db/c.test.ts', 'tests/db/sub/d.test.ts']
const env = (over: Record<string, string> = {}) => ({
  SCHEMA_RESULT: 'success', SHARDS_RESULT: 'success', SCHEMA_DB: 'true', SHARD_COUNT: '2', GITHUB_SHA: SHA, ...over,
})
type Result = { name: string; status: string }
const report = (results: Result[], over: Record<string, unknown> = {}) => ({
  success: true, numTotalTests: results.length * 3, numFailedTests: 0, numFailedTestSuites: 0, testResults: results, ...over,
})
const passed = (...paths: string[]) => paths.map((path) => ({ name: `/home/runner/work/x/x/${path}`, status: 'passed' }))
const marker = (shard: number, db = 'true', of = 2, sha = SHA) => ({ shard, of, db, sha })
const good = {
  1: { marker: marker(1), report: report(passed(FILES[0], FILES[2])) },
  2: { marker: marker(2), report: report(passed(FILES[1], FILES[3])) },
} as Record<number, { marker?: object; report?: object } | undefined>
const run = (shards = good, e = env()) => verify(e, (k: number) => shards[k], FILES)

describe('db-shards-verify', () => {
  it('passes when every file ran once and passed', () => {
    expect(run()).toMatchObject({ ok: true, errors: [] })
  })

  it('passes when nothing needed the DB tests and every job agrees', () => {
    const skipped = { 1: { marker: marker(1, 'false') }, 2: { marker: marker(2, 'false') } }
    expect(run(skipped, env({ SCHEMA_DB: 'false' })).ok).toBe(true)
  })

  it.each([
    ['a failed shard job', env({ SHARDS_RESULT: 'failure' })],
    ['a cancelled shard job', env({ SHARDS_RESULT: 'cancelled' })],
    ['a skipped shard job', env({ SHARDS_RESULT: 'skipped' })],
    ['a failed schema job', env({ SCHEMA_RESULT: 'failure' })],
    ['a missing schema decision', env({ SCHEMA_DB: '' })],
    ['no shard count', env({ SHARD_COUNT: '' })],
  ])('fails on %s', (_label, e) => {
    expect(run(good, e).ok).toBe(false)
  })

  it('fails when a shard left no record or no report', () => {
    expect(run({ ...good, 2: undefined }).ok).toBe(false)
    expect(run({ ...good, 2: { marker: marker(2) } }).ok).toBe(false)
  })

  it('fails when a shard skipped while the others ran, or the other way round', () => {
    expect(run({ ...good, 2: { marker: marker(2, 'false') } }).ok).toBe(false)
    expect(run({ 1: { marker: marker(1, 'false') }, 2: { marker: marker(2, 'false') } }).ok).toBe(false)
    expect(run({ ...good, 2: { marker: marker(2, '') } }, env({ SCHEMA_DB: 'false' })).ok).toBe(false)
  })

  it('fails on a record for another shard, shard count or commit', () => {
    expect(run({ ...good, 2: { ...good[2], marker: marker(1) } }).ok).toBe(false)
    expect(run({ ...good, 2: { ...good[2], marker: marker(2, 'true', 4) } }).ok).toBe(false)
    expect(run({ ...good, 2: { ...good[2], marker: marker(2, 'true', 2, 'b'.repeat(40)) } }).ok).toBe(false)
  })

  it('fails when a file ran nowhere, twice, or is not in this commit', () => {
    const missing = run({ ...good, 2: { marker: marker(2), report: report(passed(FILES[1])) } })
    expect(missing.ok).toBe(false)
    expect(missing.errors.join()).toContain('tests/db/sub/d.test.ts')
    expect(run({ ...good, 2: { marker: marker(2), report: report(passed(FILES[0], FILES[1], FILES[3])) } }).ok).toBe(false)
    expect(run({ ...good, 2: { marker: marker(2), report: report(passed(FILES[1], FILES[3], 'tests/db/gone.test.ts')) } }).ok).toBe(false)
  })

  it('fails on any failed or skipped file, failed test, or a report that ran nothing', () => {
    const failedFile = [{ name: `/w/${FILES[1]}`, status: 'failed' }, ...passed(FILES[3])]
    expect(run({ ...good, 2: { marker: marker(2), report: report(failedFile) } }).ok).toBe(false)
    const skippedFile = [{ name: `/w/${FILES[1]}`, status: 'skipped' }, ...passed(FILES[3])]
    expect(run({ ...good, 2: { marker: marker(2), report: report(skippedFile) } }).ok).toBe(false)
    expect(run({ ...good, 2: { marker: marker(2), report: report(passed(FILES[1], FILES[3]), { numFailedTests: 1 }) } }).ok).toBe(false)
    expect(run({ ...good, 2: { marker: marker(2), report: report(passed(FILES[1], FILES[3]), { success: false }) } }).ok).toBe(false)
    expect(run({ ...good, 2: { marker: marker(2), report: report(passed(FILES[1], FILES[3]), { numTotalTests: 0 }) } }).ok).toBe(false)
  })

  it('fails when no test files exist', () => {
    expect(verify(env(), (k: number) => good[k], []).ok).toBe(false)
  })

  it('lists the db project test files, nested ones included', () => {
    const root = mkdtempSync(join(tmpdir(), 'db-shards-'))
    const db = join(root, 'tests', 'db')
    mkdirSync(join(db, 'sub'), { recursive: true })
    for (const name of ['b.test.ts', 'a.test.ts', 'helpers.ts', 'sub/d.test.ts']) writeFileSync(join(db, name), '')
    expect(expectedFiles(db)).toEqual(['tests/db/a.test.ts', 'tests/db/b.test.ts', 'tests/db/sub/d.test.ts'])
  })
})

// The [auto] schema.sql commit (scripts/ci/schema-commit.sh) carries this run's "supabase db tests"
// result although the shards tested the branch's out-of-date schema.sql. That holds only while
// the local database is built from the migrations alone and no DB test reads schema.sql.
describe('DB test results carry onto the regenerated schema.sql commit', () => {
  const root = join(import.meta.dirname, '..', '..')
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])

  it('builds the local database from the migrations only (no declarative schema)', () => {
    const config = readFileSync(join(root, 'supabase', 'config.toml'), 'utf8')
    const section = config.split(/^\[/m).find((part) => part.startsWith('db.migrations]'))
    expect(section, '[db.migrations] in supabase/config.toml').toBeDefined()
    expect(section).toMatch(/^schema_paths\s*=\s*\[\s*\]\s*$/m)
  })

  it('has no DB or release test that reads schema.sql', () => {
    const readers = ['db', 'release']
      .flatMap((dir) => walk(join(root, 'tests', dir)))
      .filter((path) => readFileSync(path, 'utf8').includes('schema.sql'))
    expect(readers).toEqual([])
  })
})
