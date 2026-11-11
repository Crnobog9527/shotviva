import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cycler, FADE_MS } from './series-motion'

// A frame of n layers with just what cycler touches: classList and (no) images.
function frame(n: number) {
  const layers = Array.from({ length: n }, () => {
    const classes = new Set<string>()
    return {
      classes,
      classList: {
        add: (c: string) => void classes.add(c),
        remove: (c: string) => void classes.delete(c),
        replace: (a: string, b: string) => (classes.delete(a) ? (classes.add(b), true) : false),
      },
      querySelectorAll: () => [],
    }
  })
  const own = new Set<string>()
  const el = { classList: { add: (c: string) => void own.add(c) }, querySelectorAll: () => layers }
  return { el: el as unknown as HTMLElement, layers, own }
}

const state = (layers: { classes: Set<string> }[]) => layers.map((layer) => [...layer.classes].join(' '))

describe('series card crossfade', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('document', { hidden: false })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  const timers = () => [(fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number, (id: number) => clearTimeout(id)] as const

  it('arms on start, fades each next pair in over the current one, and wraps back to the first', async () => {
    const { el, layers, own } = frame(2)
    const run = cycler(el, ...timers())
    run.start(200, 1000)
    expect(own.has('mk-armed')).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(state(layers)).toEqual(['mk-on', ''])
    await vi.advanceTimersByTimeAsync(1000 + FADE_MS)
    // The outgoing pair holds under the incoming one, then drops out once covered.
    expect(state(layers)).toEqual(['mk-was', 'mk-on'])
    await vi.advanceTimersByTimeAsync(FADE_MS)
    expect(state(layers)).toEqual(['', 'mk-on'])
    await vi.advanceTimersByTimeAsync(1000)
    // Back to the server-drawn first pair: the top layer fades out over it.
    expect(state(layers)).toEqual(['', ''])
  })

  it('stays on the current pair when stopped, and a card with one pair never moves', async () => {
    const { el, layers } = frame(2)
    const run = cycler(el, ...timers())
    run.start(0, 1000)
    await vi.advanceTimersByTimeAsync(0)
    run.stop()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(state(layers)).toEqual(['mk-on', ''])
    const still = frame(0)
    cycler(still.el, ...timers()).start(0, 1000)
    expect(still.own.has('mk-armed')).toBe(false)
  })
})
