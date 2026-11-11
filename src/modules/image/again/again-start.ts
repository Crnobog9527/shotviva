import type { AgainPhoto } from '@/core/jobs'
import { NOTE_MAX_LENGTH, OUTPUT_ASPECTS, RESOLUTIONS, type OutputAspect, type Resolution } from '@/core/templates/output-options'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { FormValues } from '../workspace/workspace-form'

// Make again (T40, T6 workspace.html?again=1|expired): the workspace opened from a finished work
// with that work's settings, and its photos when they were kept with it. Plain data, so the
// server page can hand it to the client workspace.
export type AgainStart = {
  jobId: string
  values: FormValues
  madeAt: string
  photos: AgainPhoto[]
  // Why there are no photos: made before originals were kept (or the settle copy failed), or
  // the copy back just now failed. null when the photos are there.
  missing: 'old' | 'failed' | null
  // 'gallery': 一键复用 from someone's public work (T108): its settings only, never its photo.
  from?: 'gallery'
}

// Make again's link from a finished work (the photo page and the Photos grid): the template's
// workspace with ?again, so it opens with the work's settings and kept photo (T40). Links to it
// must not prefetch: opening it copies the kept photo back to a fresh upload.
export function makeAgainHref(templateId: string, jobId: string): string {
  return `/generate/${encodeURIComponent(templateId)}?again=${encodeURIComponent(jobId)}`
}

const DEFAULTS: FormValues = { aspect: 'original', resolution: '1k', note: '', copy: {}, toggles: {} }

const isAspect = (value: unknown): value is OutputAspect => (OUTPUT_ASPECTS as readonly unknown[]).includes(value)
const isResolution = (value: unknown): value is Resolution => (RESOLUTIONS as readonly unknown[]).includes(value)

function copyOf(raw: unknown, template: CatalogueTemplate): Record<string, string> {
  if (typeof raw !== 'object' || raw === null) return {}
  const values = raw as Record<string, unknown>
  return Object.fromEntries(
    template.copyFields.flatMap((field) => {
      const value = values[field.key]
      return typeof value === 'string' ? [[field.key, value.slice(0, field.maxLength)]] : []
    }),
  )
}

const asRecord = (raw: unknown): Record<string, unknown> => (typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {})

// The work's toggles as it was made (T89), for the template's toggles of today: Make again keeps
// a choice on without asking again only when the user saw today's dialog for it, i.e. the work
// recorded a confirmation (a toggle that gained `confirm` after the work starts off). A toggle the
// template no longer has is dropped.
function togglesOf(inputs: Record<string, unknown>, template: CatalogueTemplate): Record<string, boolean> {
  const values = asRecord(inputs.toggles)
  const confirmedAt = asRecord(inputs.toggles_confirmed_at)
  // A template object without `toggles` (built before T89) has none.
  const kept = (template.toggles ?? []).filter((toggle) => values[toggle.key] === true && (!toggle.confirm || typeof confirmedAt[toggle.key] === 'string'))
  return Object.fromEntries(kept.map((toggle) => [toggle.key, true]))
}

// The old work's form, read back from its stored inputs and checked against what the template
// offers today (a size or resolution it no longer has falls back to the default). Only fields
// the user filled in are read; nothing of ours is in inputs (ARCHITECTURE §4).
export function againValues(inputs: Record<string, unknown>, template: CatalogueTemplate): FormValues {
  const resolution = isResolution(inputs.resolution) && inputs.resolution in template.creditsCost ? inputs.resolution : DEFAULTS.resolution
  return {
    aspect: isAspect(inputs.aspect_ratio) ? inputs.aspect_ratio : DEFAULTS.aspect,
    resolution,
    note: typeof inputs.note === 'string' ? inputs.note.slice(0, NOTE_MAX_LENGTH) : '',
    copy: copyOf(inputs.copy, template),
    toggles: togglesOf(inputs, template),
  }
}

export const WORKSPACE_DEFAULTS = DEFAULTS
