import { describe, expect, it } from 'vitest'

import { judge, parseReviewState } from './codex-findings.mjs'
import { isServerAction, reviewRisk } from './review-risk.mjs'

// Codex reviews by risk (.github/workflows/codex-review.yml).
describe('review-risk', () => {
  it('is high for money, sign-in, the database, providers, the proxy, config and CI', () => {
    for (const path of [
      'supabase/migrations/1600_x.sql',
      'src/core/billing/credits.ts',
      'src/core/jobs/job-cost.ts',
      'src/site/billing/catalogue.ts',
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
    const result = judge({ risk: 'normal', codexThreads: [thread({})], state: done })
    expect(result.ok).toBe(false)
    expect(result.lines[0]).toContain('Unresolved Codex finding: P2 Fix the guard')
  })

  it('passes resolved threads and only warns on outdated ones', () => {
    const result = judge({ risk: 'high', codexThreads: [thread({ isResolved: true }), thread({ isOutdated: true })], state: done })
    expect(result.ok).toBe(true)
    expect(result.stale).toBe(1)
    expect(result.lines).toEqual([expect.stringContaining('Outdated Codex finding still unresolved, check it was handled: P2 Fix the guard')])
    expect(result.table).toEqual([expect.stringContaining('⚠️ outdated | P2 Fix the guard')])
  })

  it('needs a finished Codex review for high-risk changes only', () => {
    expect(judge({ risk: 'high', codexThreads: [], state: none }).ok).toBe(false)
    expect(judge({ risk: 'normal', codexThreads: [], state: none }).ok).toBe(true)
    expect(judge({ risk: 'trivial', codexThreads: [], state: none }).ok).toBe(true)
  })

  it('waits for a review in progress, even after an earlier one finished', () => {
    const result = judge({ risk: 'normal', codexThreads: [], state: { completed: false, running: true, commit: 'abc1234' } })
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
