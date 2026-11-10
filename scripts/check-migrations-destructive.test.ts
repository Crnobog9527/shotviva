import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scanMigration } from './check-migrations-destructive'

const script = fileURLToPath(new URL('./check-migrations-destructive.ts', import.meta.url))
const fixtures = fileURLToPath(new URL('./ci/fixtures/migration-guard/', import.meta.url))
const realMigrations = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))

const rules = (sql: string, severity: 'error' | 'warning') =>
  scanMigration(sql)
    .filter((finding) => finding.severity === severity)
    .map((finding) => finding.rule)
    .sort()

// Each fixture states what it must produce: `-- expect: rule, rule` (errors, `none` for a clean
// file) and optionally `-- expect-warning: rule`.
const expected = (sql: string, key: 'expect' | 'expect-warning') => {
  const line = new RegExp(`^-- ${key}: (.*)$`, 'm').exec(sql)?.[1]
  if (!line || line === 'none') return []
  return line.split(',').map((rule) => rule.trim()).sort()
}

describe('scanMigration fixtures', () => {
  for (const kind of ['pass', 'fail'] as const) {
    for (const file of readdirSync(join(fixtures, kind)).filter((name) => name.endsWith('.sql'))) {
      it(`${kind}/${file}`, () => {
        const sql = readFileSync(join(fixtures, kind, file), 'utf8')
        const errors = expected(sql, 'expect')
        // A pass fixture expects no errors; a fail fixture must name at least one.
        expect(errors.length > 0).toBe(kind === 'fail')
        expect(rules(sql, 'error')).toEqual(errors)
        expect(rules(sql, 'warning')).toEqual(expected(sql, 'expect-warning'))
      })
    }
  }
})

describe('scanMigration', () => {
  it('allows literal JSON field filters while rejecting broader JSON backfills', () => {
    const update = "update affiliates set approved_at=null where status='pending' and "
    expect(rules(update + "application->>'source'='admin_invite'", 'error')).toEqual([])
    for (const predicate of ["application->>'source' is not null", "application->>'source'='x' or true", "application->>status='x'"]) {
      expect(rules(update + predicate, 'error')).toEqual(['bulk-update'])
    }
  })

  it('reports the line the statement starts on', () => {
    const sql = '-- header\ncreate table public.a (id int);\n\n  alter table public.b\n    drop column c;\n'
    expect(scanMigration(sql)).toMatchObject([{ line: 4, rule: 'drop-column', message: 'drops column b.c' }])
  })

  it('treats public.x, "public"."x" and x as one object', () => {
    expect(scanMigration('create table "public"."t" (id int); drop table t; drop table public.t;')).toEqual([])
  })

  it('does not exempt a function created in the same file from being dropped', () => {
    expect(rules('create function public.f() returns int language sql as $$ select 1 $$; drop function f();', 'error')).toEqual([
      'drop-object',
    ])
  })

  it('flags a re-added constraint under a different name', () => {
    const sql = 'alter table public.p drop constraint p_check, add constraint p_check_v2 check (m in (1, 2));'
    expect(rules(sql, 'error')).toEqual(['add-constraint', 'drop-constraint'])
  })

  // The merged migrations are the regression samples: several of them are destructive by these
  // rules (0141 drops a column, 0020 changes a type, 0281 drops old function signatures), which
  // is why the CLI only ever scans files a PR adds.
  it('finds destructive statements in some merged migrations', () => {
    const flagged = readdirSync(realMigrations).filter(
      (name) => rules(readFileSync(join(realMigrations, name), 'utf8'), 'error').length > 0,
    )
    expect(flagged).toEqual(expect.arrayContaining(['0020_template_pricing.sql', '0141_provider_keys_vault.sql', '0281_settle_job_cost.sql']))
    // The widen-a-check shape (0460, 0560) and targeted catalog fixes (0084) are not flagged.
    expect(flagged).not.toEqual(expect.arrayContaining(['0460_payments_method_cn_card.sql']))
    expect(flagged).not.toContain('0560_payments_method_wechat_pay.sql')
    expect(flagged).not.toContain('0084_yearly_prices.sql')
  })
})

describe('check-migrations-destructive CLI', () => {
  let repo = ''
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: repo })
      .toString()
      .trim()
  const add = (path: string, text: string) => {
    mkdirSync(join(repo, path, '..'), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
  const commit = (message: string) => {
    git('add', '-A')
    git('commit', '-q', '-m', message)
  }
  const fixture = (path: string) => readFileSync(join(fixtures, path), 'utf8')
  const check = (title = '') => {
    const run = spawnSync(
      process.execPath,
      ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', join(repo, 'scripts/check-migrations-destructive.ts'), 'main', 'HEAD'],
      { cwd: repo, env: { ...process.env, PR_TITLE: title } },
    )
    return { code: run.status, out: run.stdout.toString(), err: run.stderr.toString() }
  }

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'migration-guard-'))
    git('init', '-q', '-b', 'main')
    mkdirSync(join(repo, 'scripts'))
    cpSync(script, join(repo, 'scripts/check-migrations-destructive.ts'))
    // main carries every real merged migration, destructive ones included.
    cpSync(realMigrations, join(repo, 'supabase/migrations'), { recursive: true })
    commit('base: merged migrations')
    git('checkout', '-q', '-b', 'feature')
  })
  afterEach(() => rmSync(repo, { recursive: true, force: true }))

  it('passes a branch that adds an expand migration, without scanning the merged ones', () => {
    add('supabase/migrations/0900_expand.sql', fixture('pass/expand_columns_and_tables.sql'))
    commit('feat: expand')
    const result = check()
    expect(result.err).toBe('')
    expect(result.code).toBe(0)
    expect(result.out).toContain('Scanned 1 added migration(s): supabase/migrations/0900_expand.sql')
    expect(result.out).not.toContain('::error')
  })

  it('fails a branch that adds a destructive migration, with annotations on the file', () => {
    add('supabase/migrations/0900_contract.sql', fixture('fail/drop_table_and_column.sql'))
    commit('feat: contract')
    const result = check('feat: drop legacy tables')
    expect(result.code).toBe(1)
    expect(result.out).toContain('::error file=supabase/migrations/0900_contract.sql,line=2,title=drop-object::drops table legacy_orders')
    expect(result.out).toContain('::error file=supabase/migrations/0900_contract.sql,line=3,title=drop-column::drops column templates.legacy_title')
    expect(result.out).toContain('3 destructive statement(s)')
  })

  it('lets a destructive migration through with [contract] in the PR title, as warnings', () => {
    add('supabase/migrations/0900_contract.sql', fixture('fail/truncate_delete_update.sql'))
    commit('feat: contract')
    const result = check('chore(db): drop legacy columns [contract]')
    expect(result.code).toBe(0)
    expect(result.out).not.toContain('::error')
    expect(result.out).toContain('::warning file=supabase/migrations/0900_contract.sql,line=2,title=truncate::')
    expect(result.out).toContain('PR title contains [contract]; allowing 4 destructive statement(s).')
  })

  it('does not blame a branch for destructive migrations main gained after it branched', () => {
    git('checkout', '-q', 'main')
    add('supabase/migrations/0899_main_contract.sql', 'drop table public.legacy;\n')
    commit('main: contract')
    git('checkout', '-q', 'feature')
    add('supabase/migrations/0900_expand.sql', 'alter table public.t add column c text;\n')
    commit('feat: expand')
    expect(check().code).toBe(0)
  })

  it('ignores changes to merged migrations (the append-only check owns those) and non-migration files', () => {
    add('supabase/migrations/0001_accounts.sql', `${readFileSync(join(realMigrations, '0001_accounts.sql'), 'utf8')}\ndrop table x;\n`)
    add('scripts/ci/fixtures/migration-guard/fail/new.sql', 'drop table x;\n')
    commit('chore: touch')
    const result = check()
    expect(result.code).toBe(0)
    expect(result.out).toContain('No migrations added: nothing to scan.')
  })
})
