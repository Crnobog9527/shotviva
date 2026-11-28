import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const CREATE = 'src/app/[locale]/(app)/generate/page.tsx'

// The home-screen icon starts on the home page; a signed-in person's next tap is Open app. That one
// link prefetches Create's static shell (public pages otherwise prefetch nothing), never the full
// page: a full prefetch renders /generate with the account's reads for every signed-in public page
// view and keeps that account's data in the router cache (review of #1006).
describe('Open app arrives with Create\'s shell prefetched', () => {
  it('prefetches the shell only', () => {
    const source = read('src/core/content/blocks/nav-account.tsx')
    expect(source).toMatch(/<Link href="\/generate" className="mk-open" prefetch="auto">/)
    expect(source).not.toMatch(/className="mk-open" prefetch(?:=\{true\})?>/)
  })
})

// Create from the phone first, then filled in (Owner 2026-11-24, after Higgsfield and Lovart): the
// grid comes from the public catalogue file kept on the device, the HTML carries no catalogue, and
// the account's part is one request-time read behind placeholders.
describe('Create: grid from the device, the account streamed', () => {
  const source = read(CREATE)

  it('reads the account at request time only', () => {
    expect(source).toMatch(/async function readPersonal[\s\S]*?await connection\(\)/)
    expect(source).not.toMatch(/await prefetch\(\)/)
  })

  it('draws the grid from the device copy, not from a catalogue in the page', () => {
    expect(source).toMatch(/<DeviceCatalogue create=\{personal\.then\(\(p\) => p\.create\)\} entitled=\{entitled\}/)
    expect(source).not.toMatch(/<TemplateCatalogue/)
  })

  it('gives every account-dependent part a placeholder', () => {
    expect(source).toMatch(/<Suspense fallback=\{<BalanceChipSlot \/>\}>/)
    expect(source).toMatch(/<Suspense fallback=\{<GatedFeaturesPending \/>\}>/)
    expect(source).toMatch(/initialIds=\{personal\.then\(\(p\) => p\.favoriteIds\)\}/)
  })

  it('an entitlement-gated catalogue comes from the account, never from the public file', () => {
    expect(source).toMatch(/const publicPosters = \(await cachedPublicCatalogue\(locale\)\)\?\.posters === true/)
    expect(source).toMatch(/return posters && !publicPosters \? loadCataloguePayload\(locale, Promise\.resolve\(true\)\) : null/)
  })
})
