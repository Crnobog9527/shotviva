import { spawnSync, execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./vercel-ignore-build.sh', import.meta.url))

let repo: string

const git = (...args: string[]) => execFileSync('git', args, { cwd: repo }).toString().trim()

function commit(files: Record<string, string>): string {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), body)
  }
  git('add', '-A')
  git('commit', '-q', '-m', Object.keys(files).join(' '))
  return git('rev-parse', 'HEAD')
}

/** 'skip' when the script exits 0 (Vercel cancels the build), 'build' when it exits 1. */
function decide(env: Record<string, string> = {}): 'skip' | 'build' {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, HOME: repo }
  for (const key of Object.keys(childEnv)) if (key.startsWith('VERCEL_') || key === 'SHOTVIVA_FORCE_BUILD') delete childEnv[key]
  const { status } = spawnSync('bash', [script], {
    cwd: repo,
    env: { ...childEnv, ...env },
    encoding: 'utf8',
  })
  if (status === 0) return 'skip'
  if (status === 1) return 'build'
  throw new Error(`unexpected exit ${status}`)
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'vercel-ignore-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'test')
  git('config', 'commit.gpgsign', 'false')
  commit({ 'src/app/page.tsx': 'a', 'package.json': '{}', 'README.md': 'x', 'tests/a.ts': '1' })
})

afterEach(() => rmSync(repo, { recursive: true, force: true }))

// vercel.json ignoreCommand: which pushes to validation/preview, and which manual production
// deployments of main, Vercel builds.
describe('vercel-ignore-build.sh', () => {
  it('skips when only docs, tests, CI or migrations changed since the last deployment', () => {
    const prev = git('rev-parse', 'HEAD')
    commit({ 'README.md': 'y', 'tests/a.ts': '2', '.github/workflows/ci.yml': 'on: push' })
    commit({ 'supabase/migrations/1500_x.sql': 'select 1', 'src/core/x.test.ts': 't', 'src/app/y.test.tsx': 't' })
    commit({ 'scripts/seo-check.ts': '1', 'design/a.html': '1' })
    expect(decide({ VERCEL_GIT_PREVIOUS_SHA: prev })).toBe('skip')
  })

  it('skips a redeploy of the same commit', () => {
    expect(decide({ VERCEL_GIT_PREVIOUS_SHA: git('rev-parse', 'HEAD') })).toBe('skip')
  })

  it('builds when any merge since the last deployment changed the app, not only the last one', () => {
    const prev = git('rev-parse', 'HEAD')
    commit({ 'src/app/page.tsx': 'b' })
    commit({ 'tests/a.ts': '3' })
    commit({ 'README.md': 'z' })
    expect(git('diff', '--name-only', 'HEAD^', 'HEAD')).toBe('README.md')
    expect(decide({ VERCEL_GIT_PREVIOUS_SHA: prev })).toBe('build')
  })

  it.each([
    'src/proxy.ts',
    'src/site/messages/en.json',
    'src/core/x.test-utils.ts',
    'public/home/a.webp',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'next.config.ts',
    'tsconfig.json',
    'vercel.json',
    'scripts/public-css-sources.ts',
    'scripts/public-css-sources-lib.ts',
    'scripts/check-waffo-catalog.ts',
    'scripts/ci/vercel-ignore-build.sh',
  ])('builds when %s changed', (path) => {
    const prev = git('rev-parse', 'HEAD')
    commit({ [path]: `changed ${path}` })
    expect(decide({ VERCEL_GIT_PREVIOUS_SHA: prev })).toBe('build')
  })

  it('builds when a deleted app file is the only change', () => {
    const prev = git('rev-parse', 'HEAD')
    git('rm', '-q', 'src/app/page.tsx')
    git('commit', '-q', '-m', 'rm')
    expect(decide({ VERCEL_GIT_PREVIOUS_SHA: prev })).toBe('build')
  })

  it('compares trees, so a branch reset to an unrelated line of history still works', () => {
    const base = git('rev-parse', 'HEAD')
    commit({ 'tests/a.ts': 'side' })
    const side = git('rev-parse', 'HEAD')
    git('checkout', '-q', '-b', 'other', base)
    commit({ 'README.md': 'other' })
    expect(decide({ VERCEL_GIT_PREVIOUS_SHA: side })).toBe('skip')
    commit({ 'src/app/page.tsx': 'other' })
    expect(decide({ VERCEL_GIT_PREVIOUS_SHA: side })).toBe('build')
  })

  it('builds on the first deployment of a branch (no previous SHA)', () => {
    expect(decide()).toBe('build')
    expect(decide({ VERCEL_GIT_PREVIOUS_SHA: '' })).toBe('build')
  })

  it('builds when the previous SHA is not in the clone and cannot be fetched', () => {
    commit({ 'README.md': 'q' })
    expect(decide({ VERCEL_GIT_PREVIOUS_SHA: 'deadbeef'.repeat(5) })).toBe('build')
  })

  it('builds when the previous SHA is not a hash', () => {
    expect(decide({ VERCEL_GIT_PREVIOUS_SHA: 'HEAD' })).toBe('build')
    expect(decide({ VERCEL_GIT_PREVIOUS_SHA: '--output=/tmp/x' })).toBe('build')
  })

  it('builds when git fails', () => {
    const prev = git('rev-parse', 'HEAD')
    rmSync(join(repo, '.git'), { recursive: true, force: true })
    expect(decide({ VERCEL_GIT_PREVIOUS_SHA: prev })).toBe('build')
  })

  it('always builds with SHOTVIVA_FORCE_BUILD=1', () => {
    expect(decide({ VERCEL_GIT_PREVIOUS_SHA: git('rev-parse', 'HEAD'), SHOTVIVA_FORCE_BUILD: '1' })).toBe('build')
  })
})
