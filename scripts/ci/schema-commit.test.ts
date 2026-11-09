import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const schema = 'supabase/schema.sql'
const append = 'scripts/check-migrations-append-only.sh'
const expand = 'scripts/check-migrations-destructive.ts'
const writer = 'scripts/ci/schema-commit.sh'
let dir: string

function git(...args: string[]) {
  return execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.org', ...args], { cwd: dir }).toString().trim()
}

function write(path: string, data: string) {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), data)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'schema-commit-'))
  git('init', '-q', '-b', 'main')
  // Local remote and stand-in for posting check results; no GitHub credentials or network.
  git('remote', 'add', 'origin', dir)
  write('bin/gh', '#!/bin/sh\necho "$*" >> "$CHECK_LOG"\n')
  execFileSync('chmod', ['+x', join(dir, 'bin/gh')])
  for (const script of [append, expand, writer]) {
    mkdirSync(dirname(join(dir, script)), { recursive: true })
    copyFileSync(join(root, script), join(dir, script))
  }
  write(schema, 'old snapshot')
  write('supabase/migrations/0001_base.sql', 'create table existing (id int);')
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'pr')
  write(append, '#!/bin/sh\nexit 0\n')
  write(expand, 'process.exit(0)\n')
  write(writer, '#!/bin/sh\nexit 0\n')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

function run() {
  git('add', '.')
  git('commit', '-qm', 'candidate')
  const head = git('rev-parse', 'HEAD')
  write(schema, 'regenerated')
  git('add', schema)
  const tree = git('write-tree')
  git('checkout', '-qf', 'main')
  write('fix.sql', 'regenerated')
  const result = spawnSync('bash', [writer], {
    cwd: dir, encoding: 'utf8', env: {
      ...process.env, PATH: join(dir, 'bin') + ':' + process.env.PATH, CHECK_LOG: join(dir, 'checks'),
      OLD_HEAD: head, HEAD_REF: 'pr', TREE: tree, FIX_FILE: join(dir, 'fix.sql'), GH_TOKEN: 'fixture',
      CHECKS_RESULT: 'success', DB_RESULT: 'success', RUN_URL: 'local-test', REPO: 'fixture/repo', PR_TITLE: '',
    },
  })
  return { result, head, tree }
}

it.each([
  ['0001_base.sql', 'select 1;', 'modified: supabase/migrations/0001_base.sql'],
  ['0002_new.sql', 'drop table existing;', 'drops table existing'],
])('blocks the auto-commit for %s even when the PR replaces every guard with success', (file, sql, finding) => {
  write('supabase/migrations/' + file, sql)
  const { result, head } = run()
  expect(result.status).toBe(1)
  expect(result.stdout).toContain(finding)
  expect(git('rev-parse', 'pr')).toBe(head)
})

it('pushes only the verified schema child and posts the guard results for a safe migration', () => {
  write('supabase/migrations/0002_new.sql', 'create table extra (id int);')
  const { result, head, tree } = run()
  expect(result.status, result.stderr).toBe(0)
  expect(git('rev-parse', 'pr^')).toBe(head)
  expect(git('rev-parse', 'pr^{tree}')).toBe(tree)
  expect(git('diff', '--name-only', head, 'pr')).toBe(schema)
  const checks = readFileSync(join(dir, 'checks'), 'utf8')
  expect(checks).toContain('name=merged migrations unchanged')
  expect(checks).toContain('name=new migrations keep the deployed code working')
})
