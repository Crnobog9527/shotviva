import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'

vi.mock('../workspace/photo-ratio', () => ({ naturalSize: vi.fn(async () => ({ width: 4, height: 5 })) }))
vi.mock('./use-stage-cover', () => ({ stageImage: (url: string) => ({ src: url }) }))

import { EARLY_TOUCH_FLAG, EARLY_TOUCH_SCRIPT, touchedEarly } from './early-touch'
import { runRandomOpening } from './random-opening'

type Handler = (event: { target: unknown }) => void

// Runs the inline script against a fake page: the listeners it adds, and the window it marks.
function page() {
  const handlers: Record<string, Handler[]> = {}
  const win: Record<string, unknown> = {}
  const add = (type: string, handler: Handler, capture: boolean) => {
    expect(capture).toBe(true)
    ;(handlers[type] ??= []).push(handler)
  }
  new Function('addEventListener', 'self', EARLY_TOUCH_SCRIPT)(add, win)
  const fire = (type: string, inCard: boolean) => handlers[type]?.forEach((handler) => handler({ target: { closest: (selector: string) => (selector === '#gen' && inCard ? {} : null) } }))
  return { handlers, win, fire }
}

afterEach(() => vi.unstubAllGlobals())

describe('a touch on the card before hydration (Codex #934 rule 3)', () => {
  it('is a few hundred bytes at most', () => {
    expect(EARLY_TOUCH_SCRIPT.length).toBeLessThan(200)
  })

  it.each(['pointerdown', 'keydown', 'touchstart', 'focusin'])('a %s inside the card marks it; outside does not', (type) => {
    const outside = page()
    outside.fire(type, false)
    expect(outside.win[EARLY_TOUCH_FLAG]).toBeUndefined()
    const inside = page()
    inside.fire(type, true)
    expect(inside.win[EARLY_TOUCH_FLAG]).toBe(1)
  })

  it('an interaction recorded before mount means no swap', async () => {
    vi.stubGlobal('window', { [EARLY_TOUCH_FLAG]: 1 })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ templates: [{ id: 'steak', cover: { before: '/b', after: '/a' } }] }))))
    expect(touchedEarly()).toBe(true)
    const show = vi.fn<(template: CatalogueTemplate) => void>()
    await runRandomOpening({ locale: 'en', currentId: 'soup', untouched: () => true, show, signal: new AbortController().signal })
    expect(show).not.toHaveBeenCalled()
    // It never even asked for the members.
    expect(fetch).not.toHaveBeenCalled()
  })

  it('with no early touch the swap still happens', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ templates: [{ id: 'steak', cover: { before: '/b', after: '/a' } }] }))))
    const show = vi.fn<(template: CatalogueTemplate) => void>()
    await runRandomOpening({ locale: 'en', currentId: 'soup', untouched: () => true, show, signal: new AbortController().signal })
    expect(show).toHaveBeenCalledTimes(1)
  })
})
