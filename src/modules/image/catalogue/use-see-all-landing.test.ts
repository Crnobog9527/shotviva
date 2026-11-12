import { afterEach, describe, expect, it, vi } from 'vitest'

import { landUnderBar } from './use-see-all-landing'

const at = (top: number) => ({ getBoundingClientRect: () => ({ top }) }) as unknown as HTMLElement
const bar = {} as HTMLElement

function page(stickTop: string, scrollY = 1000) {
  const scrollTo = vi.fn()
  vi.stubGlobal('getComputedStyle', () => ({ top: stickTop }))
  vi.stubGlobal('window', { scrollY, scrollTo })
  return scrollTo
}

describe('landing after 「查看全部」 (#538 review)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('puts the sentinel two pixels above the line the chip bar sticks at', () => {
    const phone = page('0px')
    landUnderBar(at(-600), bar)
    expect(phone).toHaveBeenCalledWith({ top: 1000 - 600 - 0 + 2 })
    const desktop = page('56px')
    landUnderBar(at(-600), bar)
    // Under the 56 px tab bar, not behind it.
    expect(desktop).toHaveBeenCalledWith({ top: 1000 - 600 - 56 + 2 })
  })

  it('leaves the page alone when the grid top is already in view', () => {
    const scrollTo = page('56px')
    landUnderBar(at(56), bar)
    landUnderBar(at(300), bar)
    landUnderBar(null, bar)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
