import { describe, expect, it } from 'vitest'

import { keepScrollAcrossLocks } from './scroll-lock-keeper'

// A page with a scroll position, a lock flag, an address and the events the keeper listens to.
// afterLayout runs when the test flushes: the lock's forced position is what the page shows then.
function page(start: number, dialog = true) {
  const state = { y: start, locked: false, dialog, address: '/admin/templates', scrolls: [] as number[] }
  let onScroll = () => undefined as void
  let onLock = () => undefined as void
  let pending: (() => void)[] = []
  keepScrollAcrossLocks({
    scrollY: () => state.y,
    scrollTo: (top) => { state.y = top; state.scrolls.push(top) },
    locked: () => state.locked,
    dialogOpen: () => state.dialog,
    address: () => state.address,
    onScroll: (listener) => { onScroll = listener },
    onLockChange: (listener) => { onLock = listener },
    afterLayout: (run) => { pending.push(run) },
  })
  const flush = () => { const runs = pending; pending = []; runs.forEach((run) => run()) }
  return {
    state,
    scroll: (y: number) => { state.y = y; onScroll() },
    // The lock moves the page to `forced` as its styles land.
    lock: (forced: number) => { state.locked = true; onLock(); state.y = forced; onScroll(); flush() },
    unlock: () => { state.locked = false; onLock(); flush() },
  }
}

describe('keepScrollAcrossLocks', () => {
  it('puts the page back where it was before a dialog locked it', () => {
    const p = page(0)
    p.scroll(1317)
    p.lock(684)
    p.unlock()
    expect(p.state.y).toBe(1317)
  })

  it('leaves the new page alone when the dialog navigated', () => {
    const p = page(1317)
    p.lock(684)
    p.state.address = '/admin/templates/series'
    p.unlock()
    expect(p.state.scrolls).toEqual([])
  })

  it('keeps a scroll made on purpose while the dialog was open', () => {
    const p = page(1317)
    p.lock(684)
    p.scroll(2000) // e.g. scrolling to a new item
    p.unlock()
    expect(p.state.scrolls).toEqual([])
  })

  it('ignores locks that are not a dialog of ours, and locks that did not move the page', () => {
    const sheet = page(900, false)
    sheet.lock(300)
    sheet.unlock()
    expect(sheet.state.scrolls).toEqual([])
    const still = page(500)
    still.lock(500)
    still.unlock()
    expect(still.state.scrolls).toEqual([])
  })
})
