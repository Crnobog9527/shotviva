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
