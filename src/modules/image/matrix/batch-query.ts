'use client'

import { useSearchParams } from 'next/navigation'

import { MATRIX_MAX_TEMPLATES } from './matrix-state'

// Batch create opens as a dialog on Create (Owner 2026-11-12), and its state lives in the
// address like an open series (?series=): ?batch=1 while it is open and &t=a,b for the chosen
// templates, so a refresh reopens it with them. Writes replace the entry (no history step) and
// keep every other parameter; Next keeps useSearchParams in step with history.replaceState.
export const BATCH_PARAM = 'batch'
export const TEMPLATES_PARAM = 't'

export function parseTemplateIds(value: string | null | undefined): string[] {
  if (!value) return []
  return [...new Set(value.split(',').filter(Boolean))].slice(0, MATRIX_MAX_TEMPLATES)
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
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${query}${window.location.hash}`)
}

export const openBatch = (templateIds: readonly string[] = []) => write(templateIds)
export const closeBatch = () => write(null)
// While open: the chosen templates, so a refresh brings them back.
export const keepBatchTemplates = (templateIds: readonly string[]) => write(templateIds)

export function useBatchQuery() {
  const search = useSearchParams()
  return { open: search.get(BATCH_PARAM) === '1', templateIds: parseTemplateIds(search.get(TEMPLATES_PARAM)) }
}
