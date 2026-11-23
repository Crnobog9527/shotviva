import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const CREATE = 'src/app/[locale]/(app)/generate/page.tsx'

// The home-screen icon starts on the home page; a signed-in person's next tap is Open app, which
// is prefetched in full (marketing pages use Next's full per-link prefetch): grid 1.5 -> 0.2 s (#881).
describe('Open app arrives with Create prefetched', () => {
  it('prefetches Open app per link', () => {
    expect(read('src/core/content/blocks/nav-account.tsx')).toMatch(/<Link href="\/generate" className="mk-open" prefetch>/)
  })
})

// Create shows first, then fills in (Owner 2026-11-24, 方案 A): the grid is in the App Shell a tab
// link prefetches; the account's part is one request-time read behind placeholders.
describe('Create: grid in the App Shell, the account streamed', () => {
  const source = read(CREATE)

  it('reads the account at request time only', () => {
    expect(source).toMatch(/async function readPersonal[\s\S]*?await connection\(\)/)
    expect(source).not.toMatch(/await prefetch\(\)/)
  })

  it('a grid read that fails while the shell is built falls back to request time', () => {
    expect(source).toMatch(/catch \(error\) \{[\s\S]*?unstable_rethrow\(error\)\s*logger\.warn\('create\.catalogue_shell_read_failed'[\s\S]*?await connection\(\)/)
  })

  it('gives every account-dependent part a placeholder', () => {
    expect(source).toMatch(/<Suspense fallback=\{<BalanceChipSlot \/>\}>/)
    expect(source).toMatch(/<Suspense fallback=\{<GatedFeaturesPending \/>\}>/)
    expect(source).toMatch(/initialIds=\{personal\.then\(\(p\) => p\.favoriteIds\)\}/)
    expect(source).toMatch(/create=\{personal\.then\(\(p\) => p\.create\)\}/)
  })

  it('keeps the grid the same for everyone unless the poster feature has a tier gate', () => {
    expect(source).toMatch(/access\?\.minTier \? \(await personal\)\.posters : true/)
  })
})
