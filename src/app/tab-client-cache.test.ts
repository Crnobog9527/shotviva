import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

// The browser keeps a visited page's streamed part for staleTimes.dynamic seconds (next.config.ts),
// so switching back to a tab does not cross to the server again. That is only safe while the
// places that change what those pages show also drop the cache.
describe('client cache for tab switches', () => {
  it('keeps a page’s dynamic part for 30 s, no longer', () => {
    expect(read('next.config.ts')).toMatch(/staleTimes: \{ dynamic: 30 \}/)
  })

  it('is dropped when a generation settles, a Photos item finishes and a payment returns', () => {
    for (const file of [
      'src/modules/image/generation/generation-runner.tsx',
      'src/modules/image/photos/use-running-items.ts',
      'src/core/billing/paywall/use-checkout.ts',
    ]) {
      expect(read(file), file).toMatch(/router\.refresh\(\)/)
    }
  })
})
