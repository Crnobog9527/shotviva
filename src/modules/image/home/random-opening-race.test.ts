import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'

vi.mock('../workspace/photo-ratio', () => ({ naturalSize: vi.fn(async () => ({ width: 4, height: 5 })) }))
vi.mock('./use-stage-cover', () => ({ stageImage: (url: string) => ({ src: url }) }))

import { runRandomOpening } from './random-opening'
import { watchCardTouches } from './use-random-opening'

const template = (id: string) => ({ id, cover: { before: `/b/${id}`, after: `/a/${id}` } }) as unknown as CatalogueTemplate

// The fetch of /api/home/opening, held until the test lets it answer.
function heldFetch() {
  let answer: (() => void) | null = null
  vi.stubGlobal('fetch', vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    answer = () => resolve(new Response(JSON.stringify({ templates: [template('steak'), template('cake')] })))
  })))
  return () => answer?.()
}

// What use-random-opening.ts wires up for the card: touching it aborts the pending swap.
function opening(card: EventTarget, show: (template: CatalogueTemplate) => void) {
  const controller = new AbortController()
  watchCardTouches(card, () => controller.abort())
  return runRandomOpening({ locale: 'en', currentId: 'soup', untouched: () => !controller.signal.aborted, show, signal: controller.signal }).catch(() => undefined)
}

afterEach(() => vi.unstubAllGlobals())

describe('the random opening and the visitor (#934 review)', () => {
  it('does not swap when the visitor types in the card before the members arrive', async () => {
    const answer = heldFetch()
    const card = new EventTarget()
    const show = vi.fn()
    const done = opening(card, show)
    card.dispatchEvent(new Event('input'))
    answer()
    await done
    expect(show).not.toHaveBeenCalled()
  })

  it.each(['focusin', 'change', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'])('a %s inside the card cancels it too', async (type) => {
    const answer = heldFetch()
    const card = new EventTarget()
    const show = vi.fn()
    const done = opening(card, show)
    card.dispatchEvent(new Event(type))
    answer()
    await done
    expect(show).not.toHaveBeenCalled()
  })

  it('swaps once the members arrive when nothing touched the card', async () => {
    const answer = heldFetch()
    const show = vi.fn()
    const done = opening(new EventTarget(), show)
    answer()
    await done
    expect(show).toHaveBeenCalledTimes(1)
    expect(['steak', 'cake']).toContain(show.mock.calls[0]![0].id)
  })

  it('reports the first touch only once', () => {
    const card = new EventTarget()
    const onTouch = vi.fn()
    watchCardTouches(card, onTouch)
    card.dispatchEvent(new Event('input'))
    card.dispatchEvent(new Event('change'))
    expect(onTouch).toHaveBeenCalledTimes(1)
  })
})
