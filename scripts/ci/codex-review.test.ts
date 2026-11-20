import { describe, expect, it } from 'vitest'

import { buildReview, commentableLines } from './claude-review-post.mjs'
import { claudeReviews, codexState, combineStates, judge, parseClaudeMarker, parseReviewState, tagThreads } from './codex-findings.mjs'
import { isServerAction, reviewRisk } from './review-risk.mjs'

// Codex reviews by risk (.github/workflows/codex-review.yml).
describe('review-risk', () => {
  it('is high for money, sign-in, the database, providers, the proxy, config and CI', () => {
    for (const path of [
      'supabase/migrations/1600_x.sql',
      'src/core/billing/credits.ts',
      'src/core/jobs/job-cost.ts',
      'src/site/billing/catalogue.ts',
      'src/core/templates/pricing.ts',
      'src/core/templates/provider-pricing.ts',
      'src/app/api/webhooks/stripe/route.ts',
      'src/app/api/checkout/route.ts',
      'src/core/auth/session.ts',
      'src/app/[locale]/(auth)/login/page.tsx',
      'src/core/providers/template-image-provider.ts',
      'src/modules/image/provider/openai-image-provider.ts',
      'src/proxy.ts',
      'package.json',
      '.github/workflows/ci.yml',
      'scripts/ci/review-risk.mjs',
    ]) {
      expect(reviewRisk(['src/site/messages/en.json', path]), path).toBe('high')
    }
  })

  it('is trivial for docs, copy and pictures only', () => {
    expect(reviewRisk(['README.md', 'docs/x.txt', 'src/site/messages/zh.json', 'public/covers/a.webp'])).toBe('trivial')
  })

  it('is normal for pages, components, admin screens and styles', () => {
    expect(reviewRisk(['src/app/[locale]/(marketing)/home-page.tsx', 'src/core/admin/insights-ui/query.ts'])).toBe('normal')
    expect(reviewRisk(['src/app/globals.css', 'README.md'])).toBe('normal')
  })

  it('is high for any server action, whatever its folder', () => {
    const serverAction = (path: string) => path.endsWith('actions.ts')
    expect(reviewRisk(['src/app/[locale]/(app)/admin/orders/actions.ts'], { serverAction })).toBe('high')
    expect(reviewRisk(['src/app/[locale]/(app)/account/subscription-actions.ts'], { serverAction })).toBe('high')
    expect(reviewRisk(['src/app/[locale]/(app)/admin/orders/orders-table.tsx'], { serverAction })).toBe('normal')
  })

  it('recognises a server action by its directive', () => {
    expect(isServerAction('src/app/[locale]/(app)/admin/orders/actions.ts')).toBe(true)
    expect(isServerAction('scripts/ci/review-risk.mjs')).toBe(false)
    expect(isServerAction('does/not/exist.ts')).toBe(false)
  })

  it('is high when nothing is listed', () => {
    expect(reviewRisk([])).toBe('high')
    expect(reviewRisk(['', '  '])).toBe('high')
  })
})

const thread = (over: Partial<{ isResolved: boolean; isOutdated: boolean }>) => ({
  isResolved: false,
  isOutdated: false,
  path: 'src/a.ts',
  line: 3,
  comments: { nodes: [{ author: { login: 'chatgpt-codex-connector' }, url: 'u', body: '**<sub>P2</sub> Fix the guard**\nmore' }] },
  ...over,
})
const done = { completed: true, running: false, commit: 'abc1234' }
const none = { completed: false, running: false, commit: null }

describe('codex-findings', () => {
  it('fails on an unresolved finding on current code, whatever the risk', () => {
    const result = judge({ risk: 'normal', reviewThreads: [thread({})], state: done })
    expect(result.ok).toBe(false)
    expect(result.lines[0]).toContain('Unresolved Codex finding: P2 Fix the guard')
  })

  it('passes resolved threads and only warns on outdated ones', () => {
    const result = judge({ risk: 'high', reviewThreads: [thread({ isResolved: true }), thread({ isOutdated: true })], state: done })
    expect(result.ok).toBe(true)
    expect(result.stale).toBe(1)
    expect(result.lines).toEqual([expect.stringContaining('Outdated Codex finding still unresolved, check it was handled: P2 Fix the guard')])
    expect(result.table).toEqual([expect.stringContaining('⚠️ outdated | P2 Fix the guard')])
  })

  it('needs a finished Codex review for high-risk changes only', () => {
    expect(judge({ risk: 'high', reviewThreads: [], state: none }).ok).toBe(false)
    expect(judge({ risk: 'normal', reviewThreads: [], state: none }).ok).toBe(true)
    expect(judge({ risk: 'trivial', reviewThreads: [], state: none }).ok).toBe(true)
  })

  it('waits for a review in progress, even after an earlier one finished', () => {
    const result = judge({ risk: 'normal', reviewThreads: [], state: { completed: false, running: true, commit: 'abc1234' } })
    expect(result.ok).toBe(false)
    expect(result.lines[0]).toContain('still running')
  })

  it("reads Codex's review state from its summary comment", () => {
    const body =
      '<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 {"code_review":{"commit_sha":"f77dd7f8","has_any_findings":true,"has_unresolved_findings":true,"status":"completed"},"security_review":{"commit_sha":null}} -->\n<details>'
    expect(parseReviewState(body)).toEqual({
      commit_sha: 'f77dd7f8',
      has_any_findings: true,
      has_unresolved_findings: true,
      status: 'completed',
    })
    expect(parseReviewState('plain comment')).toBeNull()
    expect(parseReviewState('<!-- codex-review-state:v1 {broken} -->')).toBeNull()
  })
})

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)
const prCommits = [SHA_A, SHA_B]
const review = (over: Record<string, unknown> = {}) => ({
  id: 7,
  user: { login: 'Crnobog9527', type: 'User' },
  state: 'COMMENTED',
  commit_id: SHA_A,
  body: `<!-- claude-review:v1 commit=${SHA_A.slice(0, 12)} -->\n### Claude review`,
  ...over,
})
const accept = (reviews: unknown[]) => claudeReviews(reviews as never, { repoOwner: 'Crnobog9527', prCommits })
const noCodex = { completed: false, running: false, failed: false, commit: null }
const claudeOn = (commit: string) => combineStates(noCodex, { completed: true, commit }, prCommits)

describe('claude reviews in the Codex findings check', () => {
  it('reads the marker', () => {
    expect(parseClaudeMarker(`x <!-- claude-review:v1 commit=${SHA_A} --> y`)).toBe(SHA_A)
    expect(parseClaudeMarker('<!-- claude-review:v1 commit=abc -->')).toBeNull()
    expect(parseClaudeMarker('claude-review:v1 commit=aaaaaaa')).toBeNull()
    expect(parseClaudeMarker(undefined)).toBeNull()
  })

  it("accepts a COMMENTED or APPROVED review from the owner's user account", () => {
    expect(accept([review()])).toEqual([{ id: 7, commit: SHA_A }])
    expect(accept([review({ state: 'APPROVED' })])).toHaveLength(1)
  })

  it('ignores other accounts, bots, other states and reviews without the marker', () => {
    expect(accept([review({ user: { login: 'someone-else', type: 'User' } })])).toEqual([])
    expect(accept([review({ user: { login: 'Crnobog9527', type: 'Bot' } })])).toEqual([])
    expect(accept([review({ user: { login: 'github-actions[bot]', type: 'Bot' } })])).toEqual([])
    expect(accept([review({ state: 'CHANGES_REQUESTED' }), review({ state: 'DISMISSED' }), review({ state: 'PENDING' })])).toEqual([])
    expect(accept([review({ body: '' }), review({ body: 'Claude reviewed this' })])).toEqual([])
    expect(claudeReviews([review()] as never, { repoOwner: '', prCommits })).toEqual([])
  })

  it('ignores the marker in a plain issue comment', () => {
    // Issue comments have no state or commit_id, so they never pass as a review.
    const comment = { id: 9, user: { login: 'Crnobog9527', type: 'User' }, body: review().body }
    expect(accept([comment])).toEqual([])
  })

  it('needs the marker to name the commit the review was on, and that commit to be on the PR', () => {
    expect(accept([review({ body: `<!-- claude-review:v1 commit=${SHA_B} -->` })])).toEqual([])
    const elsewhere = 'c'.repeat(40)
    expect(accept([review({ commit_id: elsewhere, body: `<!-- claude-review:v1 commit=${elsewhere} -->` })])).toEqual([])
  })

  it('satisfies the high-risk review requirement', () => {
    expect(judge({ risk: 'high', reviewThreads: [], state: claudeOn(SHA_B) }).ok).toBe(true)
    expect(judge({ risk: 'high', reviewThreads: [], state: combineStates(noCodex, { completed: false, commit: null }, prCommits) }).ok).toBe(false)
  })

  it('warns when the head is newer than the commit Claude reviewed', () => {
    const stale = judge({ risk: 'high', reviewThreads: [], state: { ...claudeOn(SHA_A), head: SHA_B } })
    expect(stale.ok).toBe(true)
    expect(stale.lines).toEqual([expect.stringContaining('Claude last reviewed aaaaaaa, not the head bbbbbbb')])
    expect(judge({ risk: 'high', reviewThreads: [], state: { ...claudeOn(SHA_B), head: SHA_B } }).lines).toEqual([])
  })

  it('takes the later reviewed commit when both Codex and Claude reviewed', () => {
    const both = combineStates({ completed: true, running: false, failed: false, commit: SHA_A }, { completed: true, commit: SHA_B }, prCommits)
    expect(both).toMatchObject({ completed: true, commit: SHA_B, reviewers: ['Codex', 'Claude'] })
    const codexLater = combineStates({ completed: true, running: false, failed: false, commit: SHA_B }, { completed: true, commit: SHA_A }, prCommits)
    expect(codexLater.commit).toBe(SHA_B)
  })

  it('blocks on unresolved threads of a Claude review, like Codex threads', () => {
    const raw = [
      { ...thread({}), comments: { nodes: [{ author: { login: 'Crnobog9527' }, url: 'c', body: '**<sub>P1</sub> Refund twice**', pullRequestReview: { databaseId: 7 } }] } },
      { ...thread({}), comments: { nodes: [{ author: { login: 'Crnobog9527' }, url: 'h', body: 'a human note', pullRequestReview: { databaseId: 8 } }] } },
      thread({}),
    ]
    const tagged = tagThreads(raw, new Set([7]))
    expect(tagged.map((t) => t.by)).toEqual(['Claude', 'Codex'])
    const result = judge({ risk: 'high', reviewThreads: tagged.slice(0, 1), state: claudeOn(SHA_B) })
    expect(result.ok).toBe(false)
    expect(result.lines[0]).toContain('Unresolved Claude finding: P1 Refund twice')
    const resolved = judge({ risk: 'high', reviewThreads: [{ ...tagged[0], isResolved: true }], state: claudeOn(SHA_B) })
    expect(resolved.ok).toBe(true)
  })

  it('treats a failed Codex review as not running, and blocks until a review finishes', () => {
    const failedSummary = {
      user: { login: 'chatgpt-codex-connector[bot]' },
      body: `<!-- codex-review-state:v1 {"code_review":{"commit_sha":"${SHA_B}","status":"failed"}} -->`,
    }
    const earlier = [{ user: { login: 'chatgpt-codex-connector[bot]' }, commit_id: SHA_A }]
    const codex = codexState([failedSummary], earlier)
    expect(codex).toMatchObject({ completed: false, running: false, failed: true })
    const alone = judge({ risk: 'normal', reviewThreads: [], state: combineStates(codex, { completed: false, commit: null }, prCommits) })
    expect(alone.ok).toBe(false)
    expect(alone.lines[0]).toContain('last Codex review failed')
    expect(judge({ risk: 'high', reviewThreads: [], state: combineStates(codex, { completed: true, commit: SHA_B }, prCommits) }).ok).toBe(true)
  })

  it('still waits for a running Codex review even with a Claude review', () => {
    const running = { completed: false, running: true, failed: false, commit: null }
    expect(judge({ risk: 'high', reviewThreads: [], state: combineStates(running, { completed: true, commit: SHA_B }, prCommits) }).ok).toBe(false)
  })
})

describe('claude-review-post', () => {
  const patch = '@@ -1,3 +1,4 @@\n line1\n-old\n+new2\n+new3\n line4\n@@ -10,2 +11,2 @@\n ctx11\n+add12'
  it('knows which lines can carry a comment', () => {
    expect([...commentableLines(patch)]).toEqual([1, 2, 3, 4, 11, 12])
    expect(commentableLines(undefined).size).toBe(0)
  })

  it('builds a review the check accepts, with inline findings and the rest in the body', () => {
    const { payload, outside } = buildReview(
      {
        commit: SHA_A,
        summary: 'Looks right.',
        findings: [
          { path: 'src/a.ts', line: 3, start_line: 2, severity: 'P1', title: 'Charge runs twice', body: 'No idempotency key.' },
          { path: 'src/a.ts', line: 40, title: 'Far away', body: 'Not in the diff.' },
        ],
      },
      [{ filename: 'src/a.ts', patch }],
    )
    expect(parseClaudeMarker(payload.body)).toBe(SHA_A)
    expect(payload).toMatchObject({ commit_id: SHA_A, event: 'COMMENT' })
    expect(payload.comments).toEqual([
      { path: 'src/a.ts', line: 3, side: 'RIGHT', start_line: 2, start_side: 'RIGHT', body: '**<sub>P1</sub> Charge runs twice**\n\nNo idempotency key.' },
    ])
    expect(outside).toHaveLength(1)
    expect(payload.body).toContain('Far away')
    expect(accept([{ id: 1, user: { login: 'Crnobog9527', type: 'User' }, state: 'COMMENTED', ...payload }])).toHaveLength(1)
  })

  it('refuses a short sha or a finding without a line', () => {
    expect(() => buildReview({ commit: 'abc1234', summary: '' }, [])).toThrow('full 40-character sha')
    expect(() => buildReview({ commit: SHA_A, summary: '', findings: [{ path: 'a', title: 't' }] as never }, [])).toThrow('path, line and title')
  })
})
