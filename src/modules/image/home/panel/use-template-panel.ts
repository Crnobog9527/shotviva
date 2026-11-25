'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { HomeCatalogue } from '../home-catalogue'
import { bundleOnPage, PICK_SELECTOR, requestFromTarget } from './panel-dom'
import { browsePath, readPanelQuery, withoutPanelQuery, type OpenPanel, type PanelRequest } from './panel-request'

// The panel's code and its sheet: fetched on the first sign of interest (a pointer or focus on a
// card or the generator, or the click itself), never in the page's first load (scripts/js-budget).
export const loadPanel = () => import('./template-panel')

type Args = {
  load(): Promise<HomeCatalogue>
  // The template is not one the panel can show (not live here, or a slot template): the caller
  // falls back to the first-screen card.
  onMissing(templateId: string): void
}

// Which panel is open: every opening resolves against the live catalogue (fetched once) and the
// bundle card on this page; the latest request wins. Each opening gets its own key, so the panel
// starts on the template asked for even when the same set opens twice in a row.
export function useTemplatePanel({ load, onMissing }: Args) {
  const [panel, setPanel] = useState<OpenPanel | null>(null)
  const latest = useRef(0)
  // `opener`: what focus goes back to on close; by default whatever has focus now.
  const open = useCallback((request: PanelRequest, opener: Element | null = document.activeElement) => {
    const current = ++latest.current
    const back = opener instanceof HTMLElement ? opener : null
    void Promise.all([load(), loadPanel()]).then(([catalogue, panelCode]) => {
      if (current !== latest.current) return
      const bundle = request.set?.kind === 'bundle' ? bundleOnPage(request.set.id) : null
      const resolved = panelCode.resolvePanel(request, catalogue, bundle)
      if (!resolved) return onMissing(request.templateId)
      setPanel({ ...resolved, set: { ...resolved.set, id: `${resolved.set.id}#${current}` }, file: request.file ?? null, opener: back })
    }).catch(() => {
      if (current === latest.current) onMissing(request.templateId)
    })
  }, [load, onMissing])
  const close = useCallback(() => setPanel(null), [])
  return { panel, open, close }
}

// Every card that names a template opens the panel on it (DESIGN §6.9 item 2: no confirm step),
// in the capture phase so the series card's own handler (series-motion-mount.tsx: to Create) sees
// the click as handled and stays out.
export function usePanelClicks(open: (request: PanelRequest, opener?: Element | null) => void, prefetch: () => void) {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const request = event.target instanceof Element ? requestFromTarget(event.target) : null
      if (!request || !(event.target instanceof Element)) return
      event.preventDefault()
      open(request, event.target.closest(PICK_SELECTOR))
    }
    const onIntent = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(`${PICK_SELECTOR}, #gen`)) prefetch()
    }
    document.addEventListener('click', onClick, true)
    for (const type of ['pointerover', 'focusin', 'touchstart'] as const) document.addEventListener(type, onIntent, { passive: true })
    return () => {
      document.removeEventListener('click', onClick, true)
      for (const type of ['pointerover', 'focusin', 'touchstart'] as const) document.removeEventListener(type, onIntent)
    }
  }, [open, prefetch])
}

// `?panel=<id>&set=…` (back from sign-up) and `?open=<id>` (the 404's "templates to try"): open the
// panel once after hydration, then drop the query so a reload does not reopen it.
export function usePanelFromQuery(open: (request: PanelRequest) => void) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    const search = window.location.search
    const legacy = new URLSearchParams(search).get('open')
    const request = readPanelQuery(search) ?? (legacy ? readPanelQuery(`?panel=${encodeURIComponent(legacy)}`) : null)
    if (!request) return
    const rest = new URLSearchParams(withoutPanelQuery(search))
    rest.delete('open')
    const query = rest.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
    open(request)
  }, [open])
}

// A bundle card's last chip (data-browse-category="<slug path>", empty for every template) opens
// the browse list on that category, sampling the card's first template.
export function useBrowseClicks(browse: (from: string, path: readonly string[]) => void) {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const chip = event.target instanceof Element ? event.target.closest('[data-browse-category]') : null
      const from = chip?.getAttribute('data-browse-from')
      if (!chip || !from) return
      browse(from, browsePath(chip.getAttribute('data-browse-category')))
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [browse])
}
