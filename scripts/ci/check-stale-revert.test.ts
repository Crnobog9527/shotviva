import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('../check-stale-revert.sh', import.meta.url))

// The #212 accident in miniature: a branch cut after a feature landed, committed from a tree
// that predates it, so its commit deletes the feature and puts a shared file back.
let repo = ''
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: repo }).toString().trim()
const write = (path: string, text: string) => {
  mkdirSync(join(repo, path, '..'), { recursive: true })
  writeFileSync(join(repo, path), text)
}
const commit = (message: string) => {
  git('add', '-A')
  git('commit', '-q', '-m', message)
}
const check = (title = '', window = '100') => {
  const env = { ...process.env, PR_TITLE: title, WINDOW: window }
  const run = spawnSync('bash', [join(repo, 'scripts/check-stale-revert.sh'), 'main', 'HEAD'], { cwd: repo, env })
  return { code: run.status, out: run.stdout.toString() }
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'stale-revert-'))
  git('init', '-q', '-b', 'main')
  mkdirSync(join(repo, 'scripts'))
  cpSync(script, join(repo, 'scripts/check-stale-revert.sh'))
  write('src/success.tsx', 'plate\n')
  write('src/home.tsx', 'home\n')
  commit('base')
  write('src/celebration.tsx', 'confetti\n')
  write('src/success.tsx', 'plate + celebration\n')
  commit('feat: celebration (#209)')
  git('checkout', '-q', '-b', 'feature')
})

afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('check-stale-revert.sh', () => {
  it('fails a branch whose commit undoes a recent commit on main, naming it', () => {
    rmSync(join(repo, 'src/celebration.tsx'))
    write('src/success.tsx', 'plate\n')
    write('src/home.tsx', 'home, marketing fix\n')
    commit('feat: marketing (#212)')
    const { code, out } = check()
    expect(code).toBe(1)
    expect(out).toContain('src/success.tsx is back to its state before')
    expect(out).toContain('feat: celebration (#209)')
    expect(out).not.toContain('src/home.tsx')
  })

  it('passes ordinary edits, and a branch that is merely behind main', () => {
    write('src/success.tsx', 'plate + celebration + receipt\n')
    commit('feat: receipt')
    git('checkout', '-q', 'main')
    write('src/home.tsx', 'home v2\n')
    commit('feat: newer main')
    git('checkout', '-q', 'feature')
    expect(check().code).toBe(0)
  })

  it('passes deleting or moving a recent file: only files the branch kept are judged', () => {
    rmSync(join(repo, 'src/celebration.tsx'))
    write('src/fx/celebration.tsx', 'confetti\n')
    commit('refactor: move the celebration')
    expect(check().code).toBe(0)
  })

  it('looks back only WINDOW commits on main', () => {
    write('src/success.tsx', 'plate\n')
    commit('feat: plain plate again')
    expect(check('', '1').code).toBe(1)
    git('checkout', '-q', 'main')
    write('src/home.tsx', 'home v2\n')
    commit('feat: newer main')
    git('checkout', '-q', 'feature')
    git('rebase', '-q', 'main')
    expect(check('', '1').code).toBe(0)
  })

  it('lets a deliberate revert through with [revert] in the title', () => {
    write('src/success.tsx', 'plate\n')
    commit('revert: celebration')
    const { code, out } = check('[revert] drop the celebration')
    expect(code).toBe(0)
    expect(out).toContain('src/success.tsx')
  })
})
