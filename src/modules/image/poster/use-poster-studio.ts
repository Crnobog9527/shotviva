'use client'

import { useEffect, useMemo, useState } from 'react'

import { posterContentSchema, splitPoster, type PosterBlock, type PosterContent, type PosterFields, type PosterPart } from '@/core/poster'
import type { OutputAspect, Resolution } from '@/core/templates/output-options'

import type { CatalogueImageSlot } from '../catalogue/catalogue-template'
import { useSlotPhotos } from '../workspace/use-photo-batch'

import { startJob } from '../generation/job-store'
import { clearAll, emptyContent, startContent, tidyContent, withDefaults } from './content-edit'
import { extractPoster, savePosterSet } from './poster-api'
import { useQrCheck } from './use-qr-check'

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

// fromSample: the content started from the template's sample text (fields.poster.sample), whose
// untouched values the editor shows greyer; a sorted paste replaces it.
// origin: where the content came from when it was not typed or pasted (§5.3「每周复用」): the last
// issue (with which work and when) or a photo of an old poster; saved as the set's source.
export type DraftOrigin = { source: 'reuse'; madeAt: string; templateId: string } | { source: 'photo' }
type Draft = { step: 'paste' | 'edit'; source: string; content: PosterContent; unverified: string[]; reviewed: boolean; sorted: boolean; fromSample: boolean; origin?: DraftOrigin }

const storageKey = (id: string) => `poster-draft:${id}`

// Switching style within a series keeps what was pasted and checked: the next template starts
// from this one's draft unless it already has its own.
export function carryDraft(from: string, to: string) {
  try {
    const draft = sessionStorage.getItem(storageKey(from))
    if (draft && sessionStorage.getItem(storageKey(to)) === null) sessionStorage.setItem(storageKey(to), draft)
  } catch { /* private mode: nothing to carry */ }
}

export const freshDraft = (template: Pick<StudioTemplate, 'poster'>): Draft =>
  ({ step: 'paste', source: '', content: startContent(template.poster), unverified: [], reviewed: false, sorted: false, fromSample: Boolean(template.poster.sample) })

// A stored draft whose content is still the bare skeleton (saved before the template had sample
// text, nothing typed) starts from the sample instead.
export function readDraft(template: Pick<StudioTemplate, 'poster'>, raw: string): Draft {
  const fresh = freshDraft(template)
  const stored = { ...fresh, ...(JSON.parse(raw) as Partial<Draft>) }
  const untouched = JSON.stringify(stored.content) === JSON.stringify(emptyContent(template.poster))
  return untouched ? { ...stored, content: fresh.content, fromSample: fresh.fromSample } : stored
}

function storedDraft(template: StudioTemplate): Draft | null {
  try {
    const raw = sessionStorage.getItem(storageKey(template.id))
    return raw ? readDraft(template, raw) : null
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
  return [draft, setDraft, ready] as const
}

export type StudioNotice = 'sortFailed' | 'clipped' | 'rateLimited' | 'invalid' | 'notEnough' | 'error' | null

// The editor starts on 2K when the template sells it, so a first click is never a tier the
// template has no price for; 1K and Max stay one tap away.
export const defaultResolution = (resolutions: readonly Resolution[]): Resolution =>
  resolutions.includes('2k') ? '2k' : resolutions[0] ?? '2k'

// What a sort that did not work shows: too many this hour keeps the paste step and its text
// (rateLimited); anything else opens the blocks to fill by hand under the pasted text (sortFailed).
export const sortFailure = (reply: { status: string; code?: string }): 'rateLimited' | 'sortFailed' =>
  reply.status === 'error' && reply.code === 'RATE_LIMITED' ? 'rateLimited' : 'sortFailed'

export function usePosterStudio(template: StudioTemplate, concurrency: number, onStarted: () => void) {
  const [draft, setDraft, ready] = useStoredDraft(template)
  const [aspect, setAspect] = useState<OutputAspect>(template.aspects[0] ?? '9:16')
  const [resolution, setResolution] = useState<Resolution>(() => defaultResolution(template.resolutions))
  const [busy, setBusy] = useState(false)
  // The block the model is writing while 整理内容 runs (null before the first one starts).
  const [stage, setStage] = useState<PosterBlock | null>(null)
  const [notice, setNotice] = useState<StudioNotice>(null)
  const photos = useSlotPhotos(template.slots)
  const qrCheck = useQrCheck(photos, template.poster.qr?.slot ?? null)

  const parsed = useMemo(() => posterContentSchema.safeParse(tidyContent(draft.content)), [draft.content])
  const parts: PosterPart[] = useMemo(() => (parsed.success ? splitPoster(parsed.data, template.poster) : []), [parsed, template.poster])

  const edit = (next: PosterContent, path?: string) =>
    setDraft((d) => ({ ...d, content: next, unverified: path ? d.unverified.filter((p) => p !== path) : d.unverified }))
  // A cleared part (清空本块) has nothing left to check: its flags go with its words.
  const clearPart = (next: PosterContent, prefixes: readonly string[]) =>
    setDraft((d) => ({ ...d, content: next, unverified: d.unverified.filter((p) => !prefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}.`))) }))

  async function sort() {
    setBusy(true)
    setStage(null)
    setNotice(null)
    const reply = await extractPoster(template.id, draft.source, setStage)
    setBusy(false)
    if (reply.status === 'ok') {
      // The template's table and sections heading are offered even when the text had none.
      const content = withDefaults(posterContentSchema.parse(reply.content), template.poster)
      setDraft((d) => ({ ...d, step: 'edit', content, unverified: reply.unverified, reviewed: false, sorted: true, fromSample: false, origin: undefined }))
      if (reply.clipped?.length) setNotice('clipped')
      return
    }
    // Too many sorts this hour: stay on the paste step with the text as it is and say so, rather
    // than open an empty editor (2026-11-14, seen on the test site).
    const failed = sortFailure(reply)
    setNotice(failed)
    if (failed === 'sortFailed') setDraft((d) => ({ ...d, step: 'edit', sorted: false }))
  }

  async function generate() {
    if (!parsed.success) return setNotice('invalid')
    setBusy(true)
    setNotice(null)
    const saved = await savePosterSet(template.id, parsed.data, draft.origin?.source ?? (draft.sorted ? 'paste' : 'manual'))
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
    // 全部清空 keeps the shape and drops every word; 恢复示例 puts the template's text back.
    clearAll: () => setDraft((d) => ({ ...d, content: clearAll(d.content), unverified: [], reviewed: false })),
    restoreSample: () => setDraft((d) => ({ ...d, content: startContent(template.poster), unverified: [], reviewed: false, sorted: false, fromSample: true, origin: undefined })),
    ...reuseActions(setDraft, template), ready, edit, clearPart, sort, generate, parts, valid: parsed.success, busy, stage, notice, photos, qrCheck,
    aspect, setAspect, resolution, setResolution,
  }
}

export type PosterStudioState = ReturnType<typeof usePosterStudio>

// 用上一期 / 拍照识别 (§5.3「每周复用」): the editor opens on that content, `source` being what the
// photo read; update changes the content in place (the store details).
function reuseActions(setDraft: (change: (draft: Draft) => Draft) => void, template: Pick<StudioTemplate, 'poster'>) {
  return {
    startFrom: (content: PosterContent, origin: DraftOrigin, extra: { unverified?: string[]; source?: string } = {}) =>
      setDraft((d) => ({ ...d, step: 'edit', content: withDefaults(content, template.poster), unverified: extra.unverified ?? [], reviewed: false, sorted: false, fromSample: false, origin, source: extra.source ?? d.source })),
    update: (change: (content: PosterContent) => PosterContent) => setDraft((d) => ({ ...d, content: change(d.content) })),
  }
}

// The uploads one page sends: the filled slots its kind lists, and the QR code, which every page
// carries (§5.3); or none.
export function pageUploads(template: Pick<StudioTemplate, 'poster'>, kind: string, uploads: Record<string, string>): Record<string, string> | null {
  const qr = template.poster.qr?.slot
  const listed = [...(template.poster.kinds.find((item) => item.key === kind)?.slots ?? []), ...(qr ? [qr] : [])]
  const entries = Object.entries(uploads).filter(([key]) => listed.includes(key))
  return entries.length ? Object.fromEntries(entries) : null
}
