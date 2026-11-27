import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { EARLY_TOUCH_FLAG, EARLY_TOUCH_OFF, EARLY_TOUCH_SCRIPT, takeEarlyTouch } from './early-touch'
import { beginOpening } from './use-random-opening'

type Handler = (event: { target: unknown }) => void

// Runs the inline script against a fake page: the listeners it adds, and the window it marks.
function page(win: Record<string, unknown>) {
  const handlers: Record<string, Handler[]> = {}
  const add = (type: string, handler: Handler, capture: boolean) => {
    expect(capture).toBe(true)
    ;(handlers[type] ??= []).push(handler)
  }
  new Function('addEventListener', 'self', EARLY_TOUCH_SCRIPT)(add, win)
  return (type: string, inCard: boolean) => handlers[type]?.forEach((handler) => handler({ target: { closest: (selector: string) => (selector === '#gen' && inCard ? {} : null) } }))
}

const pick = { id: 'steak', cover: { before: '/b', after: '/a' } } as unknown as CatalogueTemplate
// A stand-in for random-opening.ts: shows the pick when the card is still untouched.
const run = vi.fn(async ({ untouched, show }: { untouched(): boolean; show(template: CatalogueTemplate): void }) => {
  if (untouched()) show(pick)
})

// One mount as the hook does it: take the flag, begin; returns what it showed and its cleanup.
async function mount() {
  const show = vi.fn()
  const stop = beginOpening({ enabled: true, card: { current: new EventTarget() }, locale: 'en', currentId: 'soup', untouched: () => true, show }, takeEarlyTouch(), async () => run as never)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { show, stop }
}

afterEach(() => {
  vi.unstubAllGlobals()
  run.mockClear()
})

describe('a touch on the card before hydration (Codex #934 rule 3, #935 review)', () => {
  it('is a few hundred bytes at most', () => {
    expect(EARLY_TOUCH_SCRIPT.length).toBeLessThan(200)
  })

  it.each(['pointerdown', 'keydown', 'touchstart', 'focusin'])('a %s inside the card marks it; outside does not', (type) => {
    const outside: Record<string, unknown> = {}
    page(outside)(type, false)
    expect(outside[EARLY_TOUCH_FLAG]).toBeUndefined()
    const inside: Record<string, unknown> = {}
    page(inside)(type, true)
    expect(inside[EARLY_TOUCH_FLAG]).toBe(1)
  })

  it('an interaction recorded before mount means no swap, and nothing is even loaded', async () => {
    const win: Record<string, unknown> = {}
    vi.stubGlobal('window', win)
    page(win)('pointerdown', true)
    const { show } = await mount()
    expect(show).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('after unmount, a later mount in the same tab can swap again, and later touches are not recorded', async () => {
    const win: Record<string, unknown> = {}
    vi.stubGlobal('window', win)
    const fire = page(win)
    fire('pointerdown', true)
    const first = await mount()
    expect(first.show).not.toHaveBeenCalled()
    first.stop()
    expect(win[EARLY_TOUCH_FLAG]).toBe(0)
    expect(win[EARLY_TOUCH_OFF]).toBe(1)
    // The visitor goes on using the card (and the site), then comes back to home client-side.
    fire('pointerdown', true)
    fire('keydown', true)
    expect(win[EARLY_TOUCH_FLAG]).toBe(0)
    const second = await mount()
    expect(second.show).toHaveBeenCalledWith(pick)
  })

  it('with no early touch the first mount swaps', async () => {
    vi.stubGlobal('window', {})
    const { show } = await mount()
    expect(show).toHaveBeenCalledTimes(1)
  })
})
