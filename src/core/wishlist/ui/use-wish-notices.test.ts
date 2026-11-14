import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NoticeItem } from '../notice-items'

// The unit tests run in plain Node with no DOM, so the hook runs on a stand-in for React's
// state, ref and effect hooks: cells kept by call order across renders, and an effect re-run
// only when its deps change, as React does.
const react = vi.hoisted(() => {
  let cells: unknown[] = []
  let deps: (readonly unknown[] | undefined)[] = []
  let cell = 0
  let effect = 0
  let pending: (() => void)[] = []
  const slot = <T>(init: () => T): T => {
    const at = cell++
    if (!(at in cells)) cells[at] = init()
    return cells[at] as T
  }
  return {
    unmount() {
      cells = []
      deps = []
    },
    render<T>(hook: () => T): T {
      cell = 0
      effect = 0
      pending = []
      const result = hook()
      pending.forEach((run) => run())
      return result
    },
    useState<T>(init: T) {
      const at = cell
      const value = slot(() => init)
      const set = (next: T | ((prev: T) => T)) => {
        cells[at] = typeof next === 'function' ? (next as (prev: T) => T)(cells[at] as T) : next
      }
      return [value, set] as const
    },
    useRef<T>(init: T) {
      return slot(() => ({ current: init }))
    },
    useEffect(run: () => void, next?: readonly unknown[]) {
      const at = effect++
      const prev = deps[at]
      if (prev && next && next.every((value, i) => Object.is(value, prev[i]))) return
      deps[at] = next
      pending.push(run)
    },
  }
})
vi.mock('react', () => ({ useState: react.useState, useRef: react.useRef, useEffect: react.useEffect }))

const { useWishNotices } = await import('./use-wish-notices')

const notice = (n: number): NoticeItem => ({ requestId: `r${n}`, templateId: `t${n}`, templateName: `T${n}`, isAuthor: n === 1 })
const THREE = [notice(1), notice(2), notice(3)]

describe('useWishNotices', () => {
  const markSeen = vi.fn<(ids: string[]) => Promise<void>>()
  beforeEach(() => {
    react.unmount()
    markSeen.mockReset().mockResolvedValue()
  })

  it('shows the newest notice and marks it seen once', () => {
    const banner = react.render(() => useWishNotices(THREE, markSeen))
    expect(banner.current).toEqual(notice(1))
    expect(banner.remaining).toBe(2)
    react.render(() => useWishNotices(THREE, markSeen))
    expect(markSeen).toHaveBeenCalledExactlyOnceWith(['r1'])
  })

  // What failed on #444: once the shown notice is seen, a refetch of the layout sends a shorter
  // list, or none. The banner must keep the one on screen until the user closes it.
  it.each([
    ['no notices', []],
    ['only the unseen ones', [notice(2), notice(3)]],
  ])('keeps the current notice when a re-render brings %s', (_, later: NoticeItem[]) => {
    react.render(() => useWishNotices(THREE, markSeen))
    const banner = react.render(() => useWishNotices(later, markSeen))
    expect(banner.current).toEqual(notice(1))
    expect(banner.remaining).toBe(2)
    banner.dismiss()
    expect(react.render(() => useWishNotices(later, markSeen)).current).toEqual(notice(2))
  })

  it('steps through on dismiss, marking each as it comes up, and ends after the last', () => {
    let banner = react.render(() => useWishNotices(THREE, markSeen))
    for (const next of [2, 3]) {
      banner.dismiss()
      banner = react.render(() => useWishNotices(THREE, markSeen))
      expect(banner.current).toEqual(notice(next))
    }
    expect(banner.remaining).toBe(0)
    banner.dismiss()
    expect(react.render(() => useWishNotices(THREE, markSeen)).current).toBeNull()
    expect(markSeen.mock.calls).toEqual([[['r1']], [['r2']], [['r3']]])
  })

  it('ends at once on close ("Try it" or the close button)', () => {
    react.render(() => useWishNotices(THREE, markSeen)).close()
    const banner = react.render(() => useWishNotices(THREE, markSeen))
    expect(banner.current).toBeNull()
    expect(banner.remaining).toBe(0)
    expect(markSeen).toHaveBeenCalledOnce()
  })

  it('ignores a failed mark and keeps showing the notice', async () => {
    markSeen.mockRejectedValue(new Error('offline'))
    const banner = react.render(() => useWishNotices(THREE, markSeen))
    await Promise.resolve()
    expect(banner.current).toEqual(notice(1))
  })

  it('shows nothing for an empty list', () => {
    expect(react.render(() => useWishNotices([], markSeen)).current).toBeNull()
    expect(markSeen).not.toHaveBeenCalled()
  })
})
