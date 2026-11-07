import { describe, expect, it } from 'vitest'

import { arriveIn, closeIn, goIn, openIn, ownsEntry, urlWith, type HistoryPort } from './help-history'

// A browser tab's history, with the rule Safari and Chrome apply on Back: an entry the page
// pushed without a user gesture is skipped (Codex, #262: an old link opened directly, then Back,
// left the site). `gesture()` is the visitor pressing or typing in the page.
function fakeTab(start: string) {
  type Entry = { url: string; state: unknown; skippable: boolean }
  const origin = 'https://shotviva.test'
  const entries: Entry[] = [{ url: 'https://elsewhere.test/', state: null, skippable: false }, { url: `${origin}${start}`, state: null, skippable: false }]
  let index = 1
  let activated = false
  let waiting: (() => void) | null = null
  const port: HistoryPort = {
    href: () => entries[index]!.url,
    state: () => entries[index]!.state,
    push: (state, url) => {
      entries.splice(index + 1)
      entries.push({ url: `${origin}${url}`, state, skippable: !activated })
      index += 1
    },
    replace: (state, url) => {
      entries[index] = { ...entries[index]!, url: `${origin}${url}`, state }
    },
    // history.back() from script is not subject to the skip rule.
    back: () => {
      index -= 1
    },
    onFirstGesture: (run) => {
      waiting = run
      return () => {
        waiting = null
      }
    },
  }
  return {
    port,
    current: () => entries[index]!.url.replace(origin, ''),
    gesture() {
      activated = true
      const run = waiting
      waiting = null
      run?.()
    },
    // The browser's Back button: skippable entries are passed over.
    pressBack() {
      do index -= 1
      while (index > 0 && entries[index]!.skippable)
    },
    waiting: () => waiting !== null,
  }
}

const ID = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'

describe('opening from the Support row', () => {
  it('pushes one marked entry; Back returns to the bare account page', () => {
    const tab = fakeTab('/zh/account')
    tab.gesture() // the click on the row
    openIn(tab.port, { tab: 'new' })
    expect(tab.current()).toBe('/zh/account?help=new')
    expect(ownsEntry(tab.port.state())).toBe(true)
    tab.pressBack()
    expect(tab.current()).toBe('/zh/account')
  })

  it('moves inside the dialog without new entries, and closes by going back', () => {
    const tab = fakeTab('/account')
    tab.gesture()
    openIn(tab.port, { tab: 'new' })
    goIn(tab.port, { tab: 'list' })
    goIn(tab.port, { tab: 'thread', id: ID })
    expect(tab.current()).toBe(`/account?help=${ID}`)
    closeIn(tab.port)
    expect(tab.current()).toBe('/account')
  })
})

describe('arriving with ?help= (deep link, reload, an old /account/help link)', () => {
  it('adds nothing on load: an entry pushed without a gesture would be skipped by Back', () => {
    const tab = fakeTab('/zh/account?help=new')
    arriveIn(tab.port)
    expect(tab.current()).toBe('/zh/account?help=new')
    expect(tab.waiting()).toBe(true)
    // Back before touching anything leaves the page, like any other page.
    tab.pressBack()
    expect(tab.current()).toBe('https://elsewhere.test/')
  })

  it('on the first gesture puts the bare page underneath, so Back closes the dialog', () => {
    const tab = fakeTab('/zh/account?help=new')
    arriveIn(tab.port)
    tab.gesture()
    expect(tab.current()).toBe('/zh/account?help=new')
    tab.pressBack()
    expect(tab.current()).toBe('/zh/account')
  })

  it('keeps where the dialog moved to before the gesture landed', () => {
    const tab = fakeTab('/account?help=list')
    arriveIn(tab.port)
    // A tab switch by keyboard: the capture listener runs first, then the dialog moves.
    tab.gesture()
    goIn(tab.port, { tab: 'thread', id: ID })
    expect(tab.current()).toBe(`/account?help=${ID}`)
    closeIn(tab.port)
    expect(tab.current()).toBe('/account')
  })

  it('closing with ✕ after arriving goes back to the bare page, never off the site', () => {
    const tab = fakeTab('/account?help=new')
    arriveIn(tab.port)
    tab.gesture() // the press on ✕
    closeIn(tab.port)
    expect(tab.current()).toBe('/account')
  })

  it('a move before any gesture keeps the entry unmarked, and a close then just drops the param', () => {
    const tab = fakeTab('/account?help=new')
    goIn(tab.port, { tab: 'list' })
    expect(ownsEntry(tab.port.state())).toBe(false)
    closeIn(tab.port)
    expect(tab.current()).toBe('/account')
  })

  it('does nothing when the entry is already ours (opened from the row, then a reload)', () => {
    const tab = fakeTab('/account')
    tab.gesture()
    openIn(tab.port, { tab: 'list' })
    arriveIn(tab.port)
    expect(tab.waiting()).toBe(false)
  })

  it('cancels the wait when the dialog closes first', () => {
    const tab = fakeTab('/account?help=new')
    const cancel = arriveIn(tab.port)
    cancel()
    expect(tab.waiting()).toBe(false)
  })
})

describe('urlWith', () => {
  it('sets or removes help and keeps the rest', () => {
    expect(urlWith('https://x.test/zh/account?a=1#top', { tab: 'list' })).toBe('/zh/account?a=1&help=list#top')
    expect(urlWith('https://x.test/account?help=new&a=1', null)).toBe('/account?a=1')
  })
})
