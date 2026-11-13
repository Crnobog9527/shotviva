'use client'

import { useSearchParams } from 'next/navigation'

// Batch create opens as a dialog on Create (Owner 2026-11-12), and its state lives in the
// address like an open series (?series=): ?batch=1 while it is open and &t=a,b for the chosen
// templates, so a refresh reopens it with them. Writes replace the entry (no history step) and
// keep every other parameter; Next keeps useSearchParams in step with history.replaceState.
export const BATCH_PARAM = 'batch'
export const TEMPLATES_PARAM = 't'

// Once each; how many the batch keeps is the form's call (the plan's number of templates). Kept
// free of the matrix code: this module is in Create's first load (the card opens the dialog).
export function parseTemplateIds(value: string | null | undefined): string[] {
  if (!value) return []
  return [...new Set(value.split(',').filter(Boolean))]
}

// The search with Batch create open on these templates (none: keep what the dialog has), or
// closed (null).
export function batchSearch(current: URLSearchParams, templateIds: readonly string[] | null): string {
  const next = new URLSearchParams(current)
  next.delete(BATCH_PARAM)
  next.delete(TEMPLATES_PARAM)
  if (templateIds !== null) {
    next.set(BATCH_PARAM, '1')
    if (templateIds.length) next.set(TEMPLATES_PARAM, templateIds.join(','))
  }
  const query = next.toString().replaceAll('%2C', ',')
  return query ? `?${query}` : ''
}

// From another page (a template's workspace): Create with the dialog open on this template.
export const batchHref = (templateIds: readonly string[] = []) => `/generate${batchSearch(new URLSearchParams(), templateIds)}`

function write(templateIds: readonly string[] | null) {
  const query = batchSearch(new URLSearchParams(window.location.search), templateIds)
  // null like the catalogue's ?series= write: Next syncs useSearchParams only for a state that is
  // not its own (passing window.history.state back changed the address but not the hook).
  window.history.replaceState(null, '', `${window.location.pathname}${query}${window.location.hash}`)
}

// The control that opened it (the card, a template's link), so closing can give focus back:
// the dialog mounts after the tap, so its own focus scope cannot know who opened it.
let opener: HTMLElement | null = null

export function openBatch(templateIds: readonly string[] = []) {
  opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  write(templateIds)
}

export const closeBatch = () => write(null)

// Where focus goes when the opener is gone (a template's dialog that opened it has closed) or
// was never known (Safari does not focus a tapped button): the Batch create card on Create.
export const BATCH_ENTRY_ATTR = 'data-batch-entry'

// For the dialog's onCloseAutoFocus: focus the opener if it is still on the page, else the card;
// say whether it did.
export function restoreOpener(): boolean {
  const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>(`[${BATCH_ENTRY_ATTR}]`)
  opener = null
  if (!target) return false
  target.focus({ preventScroll: true })
  return true
}
// While open: the chosen templates, so a refresh brings them back.
export const keepBatchTemplates = (templateIds: readonly string[]) => write(templateIds)

export function useBatchQuery() {
  const search = useSearchParams()
  return { open: search.get(BATCH_PARAM) === '1', templateIds: parseTemplateIds(search.get(TEMPLATES_PARAM)) }
}
