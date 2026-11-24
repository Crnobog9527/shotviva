import { describe, expect, it } from 'vitest'

import { keepScrollAcrossLocks } from './scroll-lock-keeper'

// A page with a scroll position, a lock flag and the events the keeper listens to.
function page(start: number) {
  const state = { y: start, locked: false, scrolls: [] as number[] }
  let onScroll = () => undefined as void
  let onLock = () => undefined as void
  keepScrollAcrossLocks({
    scrollY: () => state.y,
    scrollTo: (top) => { state.y = top; state.scrolls.push(top) },
    locked: () => state.locked,
    onScroll: (listener) => { onScroll = listener },
    onLockChange: (listener) => { onLock = listener },
    afterLayout: (run) => run(),
  })
  return {
    state,
    scroll: (y: number) => { state.y = y; onScroll() },
    lock: () => { state.locked = true; onLock() },
    unlock: () => { state.locked = false; onLock() },
  }
}

describe('keepScrollAcrossLocks', () => {
  it('puts the page back where it was before a dialog locked it', () => {
    const p = page(0)
    p.scroll(1317)
    p.lock()
    p.scroll(684) // the lock shrinks the page and the browser moves it
    p.unlock()
    expect(p.state.y).toBe(1317)
  })

  it('leaves the page alone when the lock did not move it, and follows normal scrolling', () => {
    const p = page(200)
    p.lock()
    p.unlock()
    p.scroll(900)
    expect(p.state.scrolls).toEqual([])
    p.lock()
    p.scroll(0)
    p.unlock()
    expect(p.state.scrolls).toEqual([900])
  })
})
