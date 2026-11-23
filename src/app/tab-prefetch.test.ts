import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

// First tap on a tab, and Open app from the home page (the home-screen icon starts there): the
// tab's own content is fetched before the tap. The pages keep it out of the App Shell (embedded
// in every page's HTML) with prefetch(), which a per-link prefetch renders and connection() would
// not: with connection() the content waited for the tap and a request to the server.
describe('tabs open with their content', () => {
  it('prefetches each tab and Open app per link', () => {
    expect(read('src/core/app-shell/tab-bar.tsx')).toMatch(/<Link\s+href=\{item\.href\}\s+prefetch/)
    expect(read('src/core/content/blocks/nav-account.tsx')).toMatch(/<Link href="\/generate" className="mk-open" prefetch>/)
  })

  it('Create and the wall defer their content with prefetch(), not connection()', () => {
    for (const page of ['src/app/[locale]/(app)/generate/page.tsx', 'src/app/[locale]/(app)/wishlist/page.tsx']) {
      const source = read(page)
      expect(source, page).toMatch(/await prefetch\(\)/)
      expect(source, page).not.toMatch(/await connection\(\)/)
    }
  })
})
