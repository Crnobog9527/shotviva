import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { holdLinkPrefetch, linkPrefetchHeld } from './prefetch-hold'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

// A page that is still fetching what it needs to answer taps keeps links from prefetching beside
// that request (prefetch-hold.tsx). The store is module state: every hold taken here is given back.
describe('link prefetch hold', () => {
  const taken: Array<() => void> = []
  afterEach(() => taken.splice(0).forEach((release) => release()))

  it('is held while any holder remains, and a hold is given back once only', () => {
    expect(linkPrefetchHeld()).toBe(false)
    const first = holdLinkPrefetch()
    const second = holdLinkPrefetch()
    taken.push(first, second)
    expect(linkPrefetchHeld()).toBe(true)
    first()
    first() // a second call must not give back the other holder's hold
    expect(linkPrefetchHeld()).toBe(true)
    second()
    expect(linkPrefetchHeld()).toBe(false)
  })

  it('a held link is not prefetched, even one that asks for it', () => {
    expect(read('src/core/i18n/ui/localized-link.tsx')).toMatch(/const linkPrefetch = held \? false : \(prefetch \?\? \(prefetchOff \? false : undefined\)\)/)
  })

  it('Create holds until the account lands, and its app shell until it is replaced', () => {
    expect(read('src/app/[locale]/(app)/generate/page.tsx')).toMatch(/<HoldLinkPrefetch until=\{personal\.then\(\(\) => null, \(\) => null\)\} \/>/)
    expect(read('src/app/[locale]/(app)/app-shell/generate/shell-client.tsx')).toMatch(/<HoldLinkPrefetch until=\{never\} \/>/)
  })

  it('never holds longer than its limit', () => {
    expect(read('src/core/i18n/ui/prefetch-hold.tsx')).toMatch(/const timer = setTimeout\(release, HOLD_MAX_MS\)/)
  })
})
