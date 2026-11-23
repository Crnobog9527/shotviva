import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

// The home-screen icon starts on the home page; a signed-in person's next tap is Open app. That
// link is prefetched in full (marketing pages use Next's full per-link prefetch), Create's grid
// included: on the #881 preview, Open app → grid 1.5 → 0.2 s under both throttles. Inside the app
// a per-link prefetch carries only cached content, so the tab bar is left on the default.
describe('Open app arrives with Create prefetched', () => {
  it('prefetches Open app per link', () => {
    expect(read('src/core/content/blocks/nav-account.tsx')).toMatch(/<Link href="\/generate" className="mk-open" prefetch>/)
  })

  it('Create defers its catalogue with prefetch(), which a full prefetch renders', () => {
    const source = read('src/app/[locale]/(app)/generate/page.tsx')
    expect(source).toMatch(/await prefetch\(\)/)
    expect(source).not.toMatch(/await connection\(\)/)
  })
})
