'use client'

import { useEffect, useMemo, useState } from 'react'

import { posterContentSchema, splitPoster, type PosterContent, type PosterFields, type PosterPart } from '@/core/poster'
import type { OutputAspect, Resolution } from '@/core/templates/output-options'

import type { CatalogueImageSlot } from '../catalogue/catalogue-template'
import { useSlotPhotos } from '../workspace/use-photo-batch'

import { startJob } from '../generation/job-store'
import { emptyContent, tidyContent, withDefaults } from './content-edit'
import { extractPoster, savePosterSet } from './poster-api'

// The poster editor's state (ARCHITECTURE §5.3): paste → sorted blocks the user checks → one job
// per poster in the shared generation queue. Kept in sessionStorage, so a reload keeps the draft.

export type StudioTemplate = {
  id: string
  name: string
  poster: PosterFields
  aspects: OutputAspect[]
  resolutions: Resolution[]
  creditsCost: Record<Resolution, number>
  // Upload boxes (fields.images.slots) in the page's language, e.g. the prize photo; each page
  // sends only the ones its kind lists (poster.kinds[].slots).
  slots: CatalogueImageSlot[]
}

type Draft = { step: 'paste' | 'edit'; source: string; content: PosterContent; unverified: string[]; reviewed: boolean; sorted: boolean }

const storageKey = (id: string) => `poster-draft:${id}`

const freshDraft = (template: StudioTemplate): Draft =>
  ({ step: 'paste', source: '', content: emptyContent(template.poster), unverified: [], reviewed: false, sorted: false })

function storedDraft(template: StudioTemplate): Draft | null {
  try {
    const raw = sessionStorage.getItem(storageKey(template.id))
    return raw ? { ...freshDraft(template), ...(JSON.parse(raw) as Partial<Draft>) } : null
  } catch {
    return null
  }
}

// The stored draft is read after the first render, so the server's HTML and the browser's first
// render agree. Saving waits until that read has been applied (ready), so a fresh draft never
// overwrites the stored one, even when development mode runs effects twice.
function useStoredDraft(template: StudioTemplate) {
  const [draft, setDraft] = useState<Draft>(() => freshDraft(template))
  const [ready, setReady] = useState(false)
  const id = template.id
  useEffect(() => {
    const stored = storedDraft(template)
    /* eslint-disable react-hooks/set-state-in-effect -- sessionStorage exists only after mount */
    if (stored) setDraft(stored)
    setReady(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per template
  }, [id])
  useEffect(() => {
    if (!ready) return
    try { sessionStorage.setItem(storageKey(id), JSON.stringify(draft)) } catch { /* private mode: no draft */ }
  }, [draft, ready, id])
  return [draft, setDraft] as const
}

export type StudioNotice = 'sortFailed' | 'clipped' | 'rateLimited' | 'invalid' | 'notEnough' | 'error' | null

// The editor starts on 2K when the template sells it, so a first click is never a tier the
// template has no price for; 1K and Max stay one tap away.
export const defaultResolution = (resolutions: readonly Resolution[]): Resolution =>
  resolutions.includes('2k') ? '2k' : resolutions[0] ?? '2k'

export function usePosterStudio(template: StudioTemplate, concurrency: number, onStarted: () => void) {
  const [draft, setDraft] = useStoredDraft(template)
  const [aspect, setAspect] = useState<OutputAspect>(template.aspects[0] ?? '9:16')
  const [resolution, setResolution] = useState<Resolution>(() => defaultResolution(template.resolutions))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<StudioNotice>(null)
  const photos = useSlotPhotos(template.slots)

  const parsed = useMemo(() => posterContentSchema.safeParse(tidyContent(draft.content)), [draft.content])
  const parts: PosterPart[] = useMemo(() => (parsed.success ? splitPoster(parsed.data, template.poster) : []), [parsed, template.poster])

  const edit = (next: PosterContent, path?: string) =>
    setDraft((d) => ({ ...d, content: next, unverified: path ? d.unverified.filter((p) => p !== path) : d.unverified }))

  async function sort() {
    setBusy(true)
    setNotice(null)
    const reply = await extractPoster(template.id, draft.source)
    setBusy(false)
    if (reply.status === 'ok') {
      // The template's table and sections heading are offered even when the text had none.
      const content = withDefaults(posterContentSchema.parse(reply.content), template.poster)
      setDraft((d) => ({ ...d, step: 'edit', content, unverified: reply.unverified, reviewed: false, sorted: true }))
      if (reply.clipped?.length) setNotice('clipped')
      return
    }
    setNotice(reply.status === 'error' && reply.code === 'RATE_LIMITED' ? 'rateLimited' : 'sortFailed')
    setDraft((d) => ({ ...d, step: 'edit', sorted: false }))
  }

  async function generate() {
    if (!parsed.success) return setNotice('invalid')
    setBusy(true)
    setNotice(null)
    const saved = await savePosterSet(template.id, parsed.data, draft.sorted ? 'paste' : 'manual')
    setBusy(false)
    if (!saved.ok) return setNotice(saved.code === 'INVALID_INPUT' ? 'invalid' : 'error')
    const credits = template.creditsCost[resolution]
    saved.parts.forEach((page, part) => {
      const slots = pageUploads(template, page.kind, photos.uploads)
      startJob({
        templateId: template.id, templateName: template.name, resolution, aspect, credits, inputKey: null, batchId: undefined,
        body: { template_id: template.id, input_key: null, expected_credits: credits, inputs: { copy: {}, aspect_ratio: aspect, resolution }, poster: { set_id: saved.id, part }, ...(slots ? { input_slots: slots } : {}) },
      }, concurrency)
    })
    onStarted()
  }

  return {
    draft, setSource: (source: string) => setDraft((d) => ({ ...d, source })),
    toManual: () => setDraft((d) => ({ ...d, step: 'edit', sorted: false })),
    toPaste: () => setDraft((d) => ({ ...d, step: 'paste' })),
    setReviewed: (reviewed: boolean) => setDraft((d) => ({ ...d, reviewed })),
    edit, sort, generate, parts, valid: parsed.success, busy, notice, photos,
    aspect, setAspect, resolution, setResolution,
  }
}

export type PosterStudioState = ReturnType<typeof usePosterStudio>

// The uploads one page sends: the filled slots its kind lists, or none.
export function pageUploads(template: Pick<StudioTemplate, 'poster'>, kind: string, uploads: Record<string, string>): Record<string, string> | null {
  const listed = template.poster.kinds.find((item) => item.key === kind)?.slots ?? []
  const entries = Object.entries(uploads).filter(([key]) => listed.includes(key))
  return entries.length ? Object.fromEntries(entries) : null
}
