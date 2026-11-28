import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// Partial Prefetching makes Next embed a second render of the page in every response (measured
// 2026-11-28: app documents 35% heavier, the first picture 1.1 s later on slow 4G, tab switches no
// faster). It stays off, app-wide and per segment, until that embedding can be had separately.
describe('app pages carry their flight data once', () => {
  it('no app segment opts into partial prefetching', () => {
    for (const file of ['src/app/[locale]/(app)/layout.tsx', 'src/app/[locale]/layout.tsx', 'src/app/[locale]/(app)/generate/page.tsx', 'src/app/[locale]/(app)/photos/page.tsx', 'src/app/[locale]/(app)/account/page.tsx', 'src/app/[locale]/(app)/wishlist/page.tsx']) {
      expect(code(read(file)), file).not.toMatch(/export const prefetch\s*(?::[^=]+)?=\s*['"]partial['"]/)
    }
  })

  it('nor does the app as a whole', () => {
    expect(code(read('next.config.ts'))).toMatch(/partialPrefetching: false/)
  })
})
