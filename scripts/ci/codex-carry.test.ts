import { describe, expect, it } from 'vitest'

import { carriedOver, fullState, judge, SCHEMA_FILE, SCHEMA_MARKER, schemaCarry } from './codex-findings.mjs'

// A review of R holds for the head only across scripts/ci/schema-commit.sh's own commits.
const R = 'a'.repeat(40)
const S1 = '1'.repeat(40)
const S2 = '2'.repeat(40)
const BOT = 'github-actions[bot]'
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com'
const schemaOnly = [{ filename: SCHEMA_FILE, status: 'modified' }]

type Over = { login?: string; committerLogin?: string; email?: string; message?: string; parents?: string[] }
const commit = (sha: string, parent: string, o: Over = {}) => ({
  sha,
  parents: (o.parents ?? [parent]).map((p) => ({ sha: p })),
  author: { login: o.login ?? BOT },
  committer: { login: o.committerLogin ?? o.login ?? BOT },
  commit: {
    message: o.message ?? `${SCHEMA_MARKER}\n\nRegenerated from supabase/migrations by CI run x (T88).`,
    author: { email: o.email ?? BOT_EMAIL },
    committer: { email: o.email ?? BOT_EMAIL },
  },
})
const compareOf = (commits: ReturnType<typeof commit>[], files = schemaOnly) => ({
  status: 'ahead',
  ahead_by: commits.length,
  behind_by: 0,
  merge_base_commit: { sha: R },
  commits,
  files,
})
const carry = (commits: ReturnType<typeof commit>[], filesOf: (sha: string) => unknown = () => schemaOnly, compare = compareOf(commits)) =>
  schemaCarry({ reviewed: R, head: commits.at(-1)!.sha, compare, filesOf })

describe('schema-only carry of a review', () => {
  it('carries one [auto] schema commit', () => {
    expect(carry([commit(S1, R)])).toMatchObject({ carried: true })
  })

  it('carries two consecutive [auto] schema commits, and a short reviewed sha', () => {
    expect(carry([commit(S1, R), commit(S2, S1)])).toMatchObject({ carried: true })
    const commits = [commit(S1, R)]
    expect(schemaCarry({ reviewed: R.slice(0, 8), head: S1, compare: compareOf(commits), filesOf: () => schemaOnly })).toMatchObject({ carried: true })
  })

  it('does not carry across a human commit in between', () => {
    const human = commit(S1, R, { login: 'Crnobog9527', email: 'me@example.org', message: 'fix: thing' })
    expect(carry([human, commit(S2, S1)])).toMatchObject({ carried: false })
  })

  it('does not carry an [auto] commit that touches another file', () => {
    const more = [...schemaOnly, { filename: 'src/core/billing/credits.ts', status: 'modified' }]
    expect(carry([commit(S1, R)], () => more, compareOf([commit(S1, R)], more))).toMatchObject({ carried: false })
    // Even when the compare's total looks like schema.sql alone, each commit's own files count.
    expect(carry([commit(S1, R)], () => [{ filename: 'src/proxy.ts', status: 'modified' }])).toMatchObject({ carried: false })
    expect(carry([commit(S1, R)], () => [{ filename: SCHEMA_FILE, status: 'renamed', previous_filename: 'x.sql' }])).toMatchObject({ carried: false })
  })

  it('does not carry a merge commit', () => {
    expect(carry([commit(S1, R, { parents: [R, 'c'.repeat(40)] })])).toMatchObject({ carried: false })
  })

  it('does not carry a commit by anyone but the github-actions bot, nor a wrong message', () => {
    expect(carry([commit(S1, R, { login: 'Crnobog9527' })])).toMatchObject({ carried: false })
    expect(carry([commit(S1, R, { committerLogin: 'Crnobog9527' })])).toMatchObject({ carried: false })
    expect(carry([commit(S1, R, { email: 'me@example.org' })])).toMatchObject({ carried: false })
    expect(carry([commit(S1, R, { message: `${SCHEMA_MARKER} and more` })])).toMatchObject({ carried: false })
    expect(carry([commit(S1, R, { message: `feat: x\n\n${SCHEMA_MARKER}` })])).toMatchObject({ carried: false })
  })

  it('does not carry when the head does not descend from the reviewed commit', () => {
    const commits = [commit(S1, R)]
    expect(carry(commits, undefined, { ...compareOf(commits), status: 'diverged', behind_by: 2 })).toMatchObject({ carried: false })
    expect(carry(commits, undefined, { ...compareOf(commits), merge_base_commit: { sha: 'd'.repeat(40) } })).toMatchObject({ carried: false })
    expect(carry(commits, undefined, { ...compareOf(commits), ahead_by: 3 })).toMatchObject({ carried: false })
    // A commit chain that skips a link (out of order or not starting at R).
    expect(carry([commit(S1, 'e'.repeat(40))])).toMatchObject({ carried: false })
    expect(schemaCarry({ reviewed: R, head: R, compare: compareOf([]), filesOf: () => schemaOnly })).toMatchObject({ carried: false })
  })

  it('reads the compare and each commit from GitHub', async () => {
    const data: Record<string, unknown> = {
      [`/repos/o/r/compare/${R}...${S2}`]: compareOf([commit(S1, R), commit(S2, S1)]),
      [`/repos/o/r/commits/${S1}`]: { files: schemaOnly },
      [`/repos/o/r/commits/${S2}`]: { files: schemaOnly },
    }
    const seen: string[] = []
    const get = async (path: string) => (seen.push(path), data[path])
    expect(await carriedOver({ repo: 'o/r', reviewed: R, head: S2, get })).toMatchObject({ carried: true })
    expect(seen.sort()).toEqual(Object.keys(data).sort())
  })
})

describe('the Codex findings check with a carried review', () => {
  const thread = { isResolved: false, isOutdated: false, path: 'src/a.ts', line: 3, by: 'Codex', comments: { nodes: [{ url: 'u', body: '**P1** Bad' }] } }
  const state = { completed: true, running: false, failed: false, commit: R, reviewers: ['Codex'], claudeReviewers: [], head: S1 }

  it('drops the head-is-newer warning only when the review is carried', () => {
    expect(judge({ risk: 'high', reviewThreads: [], state: { ...state, carried: false } }).lines).toEqual([expect.stringContaining('not the head')])
    const carried = judge({ risk: 'high', reviewThreads: [], state: { ...state, carried: true, carryReason: 'r' } })
    expect(carried.ok).toBe(true)
    expect(carried.lines).toEqual([expect.stringContaining('carried over')])
  })

  it('still fails on an open finding from the carried review', () => {
    expect(judge({ risk: 'high', reviewThreads: [thread], state: { ...state, carried: true, carryReason: 'r' } }).ok).toBe(false)
  })

  it('wires the carry into fullState for the head, and fails closed when the compare errors', async () => {
    const list = async (path: string) =>
      path.endsWith('/comments')
        ? [{ user: { login: 'chatgpt-codex-connector[bot]' }, body: `<!-- codex-review-state:v1 {"code_review":{"commit_sha":"${R}","status":"completed"}} -->` }]
        : path.endsWith('/commits')
          ? [{ sha: R }, { sha: S1 }]
          : []
    const data: Record<string, unknown> = {
      [`/repos/o/r/compare/${R}...${S1}`]: compareOf([commit(S1, R)]),
      [`/repos/o/r/commits/${S1}`]: { files: schemaOnly },
    }
    const ok = await fullState({ repo: 'o/r', pr: '1', list, head: S1, get: async (p: string) => data[p] })
    expect(ok.state).toMatchObject({ completed: true, commit: R, carried: true })
    // A Claude review (owner-marked PR review of R) carries the same way, with no Codex at all.
    const claudeList = async (path: string) =>
      path.endsWith('/reviews')
        ? [{ id: 9, user: { login: 'o', type: 'User' }, state: 'COMMENTED', commit_id: R, body: `<!-- claude-review:v1 commit=${R} reviewer=rev -->` }]
        : path.endsWith('/commits')
          ? [{ sha: R }, { sha: S1 }]
          : []
    const claude = await fullState({ repo: 'o/r', pr: '1', list: claudeList, head: S1, get: async (p: string) => data[p] })
    expect(claude.state).toMatchObject({ completed: true, commit: R, reviewers: ['Claude'], carried: true })
    expect(judge({ risk: 'high', reviewThreads: [], state: claude.state }).lines).toEqual([expect.stringContaining('carried over')])
    // A human commit after the Claude review is not carried.
    const human = { ...data, [`/repos/o/r/compare/${R}...${S1}`]: compareOf([commit(S1, R, { login: 'o', email: 'o@example.org' })]) }
    const notCarried = await fullState({ repo: 'o/r', pr: '1', list: claudeList, head: S1, get: async (p: string) => human[p] })
    expect(notCarried.state).toMatchObject({ reviewers: ['Claude'], carried: false })
    const broken = await fullState({ repo: 'o/r', pr: '1', list, head: S1, get: async () => Promise.reject(new Error('404')) })
    expect(broken.state).toMatchObject({ completed: true, carried: false })
  })
})
