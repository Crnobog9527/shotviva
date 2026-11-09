import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./schema-check.sh', import.meta.url))
const MARKER = 'chore(db): regenerate schema.sql [auto]'

type Repo = { dir: string; git: (...args: string[]) => string; write: (path: string, text: string) => void }

function repo(): Repo {
  const dir = mkdtempSync(join(tmpdir(), 'schema-check-'))
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir }).toString().trim()
  const write = (path: string, text: string) => {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  git('init', '-q', '-b', 'main')
  git('remote', 'add', 'origin', dir)
  return { dir, git, write }
}

// main and a PR branch, both changing the schema, checked out as GitHub's PR merge commit:
// main's own migration is already in main's schema.sql, the branch forgot to regenerate its own.
function pullRequest(headMessage = 'feat: add a migration') {
  const r = repo()
  r.write('supabase/schema.sql', 'a\nb\nc\nd\ne\nf\n')
  r.git('add', '.')
  r.git('commit', '-qm', 'base')
  r.git('checkout', '-qb', 'feature')
  r.write('supabase/migrations/0002_head.sql', 'create table h ();\n')
  r.git('add', '.')
  r.git('commit', '-qm', headMessage)
  r.git('checkout', '-q', 'main')
  r.write('supabase/migrations/0001_main.sql', 'create table m ();\n')
  r.write('supabase/schema.sql', 'a\nb\nc\nd\ne\nf\nm\n')
  r.git('add', '.')
  r.git('commit', '-qm', 'main moved')
  r.git('checkout', '-q', '--detach')
  r.git('merge', '-q', '--no-ff', 'feature', '-m', 'Merge')
  return r
}

function check(r: Repo, env: Record<string, string>) {
  const bin = mkdtempSync(join(tmpdir(), 'fake-gh-'))
  // Stands in for the compare API: the merge base of base...head.
  writeFileSync(
    join(bin, 'gh'),
    '#!/usr/bin/env bash\nrange=${2##*/}\ngit merge-base "${range%...*}" "${range#*...}"\n',
  )
  chmodSync(join(bin, 'gh'), 0o755)
  const output = join(bin, 'output')
  writeFileSync(output, '')
  const result = spawnSync('bash', [script], {
    cwd: r.dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      EVENT: 'pull_request',
      SAME_REPO: 'true',
      REPO: 'o/r',
      FIX_DIR: join(bin, 'fix'),
      GITHUB_OUTPUT: output,
      ...env,
    },
  })
  const outputs = Object.fromEntries(
    readFileSync(output, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('=')),
  )
  return { status: result.status, out: result.stdout + result.stderr, outputs, fixDir: join(bin, 'fix') }
}

// "supabase db tests" after `pnpm db:schema` (T88).
describe('schema-check.sh', () => {
  it('passes a current schema.sql without preparing anything', () => {
    const r = pullRequest()
    const result = check(r, {})
    expect(result.status).toBe(0)
    expect(result.out).toContain('schema.sql matches the migrations.')
    expect(result.outputs).toEqual({})
  })

  it('prepares the branch copy plus exactly the regenerated change, verified against the tested tree', () => {
    const r = pullRequest()
    r.write('supabase/schema.sql', 'a\nb\nh\nc\nd\ne\nf\nm\n') // what pnpm db:schema would write
    const result = check(r, {})
    expect(result.status).toBe(0)
    expect(result.out).toContain('::warning')
    expect(result.outputs.fix).toBe('true')
    // The branch's own file (no main-only `m`) with the branch's `h`.
    const fixed = readFileSync(join(result.fixDir, 'schema.sql'), 'utf8')
    expect(fixed).toBe('a\nb\nh\nc\nd\ne\nf\n')
    const blob = execFileSync('git', ['hash-object', '--stdin'], { input: fixed }).toString().trim()
    expect(r.git('ls-tree', result.outputs.tree, 'supabase/schema.sql')).toContain(blob)
  })

  it('fails with the diff for forks, pushes and a branch already on the automatic commit', () => {
    const stale = (r: Repo) => r.write('supabase/schema.sql', 'a\nb\nh\nc\nd\ne\nf\nm\n')
    const fork = pullRequest()
    stale(fork)
    expect(check(fork, { SAME_REPO: 'false' })).toMatchObject({ status: 1, outputs: {} })
    const push = pullRequest()
    stale(push)
    expect(check(push, { EVENT: 'push' })).toMatchObject({ status: 1, outputs: {} })
    const again = pullRequest(MARKER)
    stale(again)
    const result = check(again, {})
    expect(result).toMatchObject({ status: 1, outputs: {} })
    expect(result.out).toContain('already the automatic schema.sql commit')
    expect(result.out).toContain('+h')
  })
})
