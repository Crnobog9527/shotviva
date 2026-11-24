'use client'

import { useLocale } from 'next-intl'
import { useEffect } from 'react'

import { useRouter } from '../../i18n/navigation'
import { buildLayers, BUNDLE_FIRST_ATTR, BUNDLE_LABEL_ATTR, LAYER_TEMPLATE_ATTR, MORE_ATTR } from './series-layers'
import { seriesLayers } from './series-layers-source'
import { cycler, HOVER_DELAY_MS, HOVER_HOLD_MS, VIEW_HOLD_MS, type Cycler } from './series-motion'

// Wires every series card on the page once (one effect, no per-card React state): with a fine
// pointer a card plays while the pointer rests on it or it has keyboard focus; on a touch screen
// it plays on its own while most of it is in view. Static under prefers-reduced-motion, and
// before hydration (the server draws the first pair).
function wire(frame: HTMLElement, locale: string, touch: boolean, observer: IntersectionObserver | null, cards: Map<Element, Cycler>) {
  const card = frame.closest('.mk-series') ?? frame
  const bundle = card.hasAttribute(BUNDLE_FIRST_ATTR)
  const cycle = cycler(frame, undefined, undefined, bundle ? (layer) => showBundleTemplate(card, layer) : undefined)
  const key = frame.getAttribute(MORE_ATTR) ?? ''
  // The later pairs become layers the first time the card plays, not before (series-layers.ts):
  // their addresses arrive with the first play, so the card starts once they are in, unless the
  // pointer has left (or the card scrolled away) meanwhile.
  let wanted = false
  const run: Cycler = {
    start(delay, hold) {
      wanted = true
      seriesLayers(locale).then(
        (layers) => {
          buildLayers(frame, layers.get(key) ?? [])
          if (wanted) cycle.start(delay, hold)
        },
        () => undefined,
      )
    },
    stop() {
      wanted = false
      cycle.stop()
    },
  }
  cards.set(frame, run)
  if (touch) {
    observer?.observe(frame)
    return () => undefined
  }
  const start = () => run.start(HOVER_DELAY_MS, HOVER_HOLD_MS)
  const stop = () => run.stop()
  card.addEventListener('pointerenter', start)
  card.addEventListener('pointerleave', stop)
  // A bundle card holds still under keyboard focus, so what its label names is what it picks.
  if (!bundle) {
    card.addEventListener('focusin', start)
    card.addEventListener('focusout', stop)
  }
  return () => {
    card.removeEventListener('pointerenter', start)
    card.removeEventListener('pointerleave', stop)
    card.removeEventListener('focusin', start)
    card.removeEventListener('focusout', stop)
  }
}

// A bundle card picks the template on show (bundle-card.tsx): the layer's own template id, or the
// server-drawn pair's; its label names that template (no live region: it changes only on show).
function showBundleTemplate(card: Element, layer: HTMLElement | undefined) {
  const id = layer ? layer.getAttribute(LAYER_TEMPLATE_ATTR) : card.getAttribute(BUNDLE_FIRST_ATTR)
  if (!id) return
  card.setAttribute('data-pick-template', id)
  const name = [...(card.parentElement?.querySelectorAll('.mk-bundle-names [data-pick-template]') ?? [])]
    .find((pick) => pick.getAttribute('data-pick-template') === id)?.textContent
  const label = card.getAttribute(BUNDLE_LABEL_ATTR)
  if (name && label) card.setAttribute('aria-label', label.replace('%s', name))
}

// A series card (and a lone series' "Open" pill) is a <button data-open-series="/generate?series=…">:
// no crawlable link to Create, which needs a session and is noindex (SEO 2026-11-14). One click
// handler for the page moves to it, in the page's language; signed out, Create sends the visitor
// to sign in and back, as the link did.
function useOpenSeries() {
  const router = useRouter()
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('[data-open-series]') : null
      const href = target?.getAttribute('data-open-series')
      if (href?.startsWith('/generate')) router.push(href)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [router])
}

export function SeriesMotion() {
  useOpenSeries()
  const locale = useLocale()
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const frames = [...document.querySelectorAll<HTMLElement>(`[${MORE_ATTR}]`)]
    if (!frames.length) return
    const touch = !matchMedia('(hover: hover) and (pointer: fine)').matches
    const cards = new Map<Element, Cycler>()
    const observer = touch
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const run = cards.get(entry.target)
              if (entry.isIntersecting) run?.start(VIEW_HOLD_MS / 2, VIEW_HOLD_MS)
              else run?.stop()
            }
          },
          { threshold: 0.6 },
        )
      : null
    const unwire = frames.map((frame) => wire(frame, locale, touch, observer, cards))
    return () => {
      observer?.disconnect()
      for (const off of unwire) off()
      for (const run of cards.values()) run.stop()
    }
  }, [locale])
  return null
}
