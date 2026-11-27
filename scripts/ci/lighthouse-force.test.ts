import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const force = (...paths: string[]) =>
  execFileSync(fileURLToPath(new URL('./lighthouse-force.sh', import.meta.url)), {
    input: paths.join('\n'),
    encoding: 'utf8',
  }).trim()

// Lighthouse runs whatever the fingerprint says for these (ci.yml, lighthouse-base).
describe('lighthouse-force', () => {
  it('forces the measured routes, server entry points, build setup and measurement', () => {
    for (const path of [
      'src/proxy.ts',
      'src/instrumentation-client.ts',
      'src/app/[locale]/layout.tsx',
      'src/app/[locale]/marketing-chrome.tsx',
      'src/app/[locale]/(marketing)/page.tsx',
      'src/app/[locale]/(marketing)/marketing.css',
      'src/app/[locale]/(marketing)/pricing/page.tsx',
      'src/app/[locale]/(marketing)/[slug]/page.tsx',
      'next.config.ts',
      'pnpm-lock.yaml',
      'lighthouserc.devtools.json',
      'scripts/ci/lighthouse-server.mjs',
      'scripts/ci/page-fingerprint.mjs',
      '.github/workflows/ci.yml',
    ]) {
      expect(force('src/core/admin/x.ts', path), path).toBe('true')
    }
  })

  it('leaves everything else to the fingerprint', () => {
    expect(
      force(
        'src/core/admin/x.ts',
        'src/core/jobs/job-cost.ts',
        'src/app/[locale]/(app)/admin/page.tsx',
        'src/app/[locale]/(marketing)/gallery/page.tsx',
        'src/app/[locale]/(marketing)/page.test.ts',
        'src/site/messages/en.json',
        'supabase/migrations/1600_x.sql',
      ),
    ).toBe('false')
  })

  it('forces when nothing is listed', () => {
    expect(force()).toBe('true')
  })
})

describe('ci-gate', async () => {
  const { gate, lighthouseDecision } = await import('./ci-gate.mjs')
  const base = { EVENT: 'pull_request', CHECKS: 'success', DB: 'success', BASE: 'success', CODE: 'true', FORCE: 'false', REASON: '' }
  const pages = JSON.stringify({ '/': 'a', '/zh': 'b', 'public/': 'p' })

  it('explains a skip and names each changed page', () => {
    expect(lighthouseDecision({ ...base, PAGES: pages, BASE_PAGES: pages }).why).toMatch(/^skipped/)
    const changed = lighthouseDecision({ ...base, PAGES: pages, BASE_PAGES: JSON.stringify({ '/': 'a', '/zh': 'x', 'public/': 'p' }) })
    expect(changed.why).toBe('run: changed /zh')
    expect(changed.rows).toEqual([
      { name: '/', changed: false },
      { name: '/zh', changed: true },
      { name: 'public/', changed: false },
    ])
  })

  it('fails when lint, typecheck or unit tests failed even though the build passed and Lighthouse ran', () => {
    expect(gate({ ...base, CHECKS: 'failure', BUILD: 'success', LIGHTHOUSE: 'success' })).toBe(false)
    expect(lighthouseDecision({ ...base, CHECKS: 'failure', BUILD: 'failure' }).why).toBe('not run: the build did not pass')
    expect(gate({ ...base, BUILD: 'success', LIGHTHOUSE: 'success' })).toBe(true)
  })

  it('explains forced runs, missing fingerprints and docs-only changes', () => {
    expect(lighthouseDecision({ ...base, FORCE: 'true', REASON: 'label run-lighthouse' }).why).toBe('run: forced (label run-lighthouse)')
    expect(lighthouseDecision({ ...base, PAGES: pages, BASE_PAGES: '' }).why).toBe('run: a fingerprint is missing')
    expect(lighthouseDecision({ ...base, BASE: 'failure' }).why).toMatch(/^run: the baseline/)
    expect(lighthouseDecision({ ...base, CODE: 'false' }).why).toMatch(/docs-only/)
  })

  it('passes only when checks and DB passed and Lighthouse passed or was not needed', () => {
    expect(gate({ CHECKS: 'success', DB: 'success', LIGHTHOUSE: 'skipped' })).toBe(true)
    expect(gate({ CHECKS: 'success', DB: 'success', LIGHTHOUSE: 'success' })).toBe(true)
    expect(gate({ CHECKS: 'success', DB: 'success', LIGHTHOUSE: 'failure' })).toBe(false)
    expect(gate({ CHECKS: 'success', DB: 'cancelled', LIGHTHOUSE: 'skipped' })).toBe(false)
    expect(gate({ CHECKS: 'failure', DB: 'success', LIGHTHOUSE: 'skipped' })).toBe(false)
  })
})
