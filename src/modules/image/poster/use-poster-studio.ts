'use client'

import { useEffect, useMemo, useState } from 'react'

import { posterContentSchema, splitPoster, type PosterContent, type PosterFields, type PosterPart } from '@/core/poster'
import type { OutputAspect, Resolution } from '@/core/templates/output-options'

import { startJob } from '../generation/job-store'
import { emptyContent, tidyContent } from './content-edit'
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
}

type Draft = { step: 'paste' | 'edit'; source: string; content: PosterContent; unverified: string[]; reviewed: boolean; sorted: boolean }

const storageKey = (id: string) => `poster-draft:${id}`

function loadDraft(template: StudioTemplate): Draft {
  const fresh: Draft = { step: 'paste', source: '', content: emptyContent(template.poster), unverified: [], reviewed: false, sorted: false }
  try {
    const raw = sessionStorage.getItem(storageKey(template.id))
    return raw ? { ...fresh, ...(JSON.parse(raw) as Partial<Draft>) } : fresh
  } catch {
    return fresh
  }
}

export type StudioNotice = 'sortFailed' | 'rateLimited' | 'invalid' | 'notEnough' | 'error' | null

export function usePosterStudio(template: StudioTemplate, concurrency: number, onStarted: () => void) {
  const [draft, setDraft] = useState<Draft>(() => loadDraft(template))
  const [aspect, setAspect] = useState<OutputAspect>(template.aspects[0] ?? '9:16')
  const [resolution, setResolution] = useState<Resolution>(template.resolutions[0] ?? '2k')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<StudioNotice>(null)

  useEffect(() => {
    try { sessionStorage.setItem(storageKey(template.id), JSON.stringify(draft)) } catch { /* private mode: no draft */ }
  }, [draft, template.id])

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
      // The template's table is offered even when the text had none, so it can be typed in.
      const content = reply.content.table ? reply.content : { ...reply.content, table: emptyContent(template.poster).table }
      setDraft((d) => ({ ...d, step: 'edit', content, unverified: reply.unverified, reviewed: false, sorted: true }))
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
    saved.parts.forEach((_, part) => startJob({
      templateId: template.id, templateName: template.name, resolution, aspect, credits, inputKey: null, batchId: undefined,
      body: { template_id: template.id, input_key: null, expected_credits: credits, inputs: { copy: {}, aspect_ratio: aspect, resolution }, poster: { set_id: saved.id, part } },
    }, concurrency))
    onStarted()
  }

  return {
    draft, setSource: (source: string) => setDraft((d) => ({ ...d, source })),
    toManual: () => setDraft((d) => ({ ...d, step: 'edit', sorted: false })),
    toPaste: () => setDraft((d) => ({ ...d, step: 'paste' })),
    setReviewed: (reviewed: boolean) => setDraft((d) => ({ ...d, reviewed })),
    edit, sort, generate, parts, valid: parsed.success, busy, notice,
    aspect, setAspect, resolution, setResolution,
  }
}

export type PosterStudioState = ReturnType<typeof usePosterStudio>
