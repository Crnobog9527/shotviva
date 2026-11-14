import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { findLastWorks, keptInputsOf, photosForAgain, type AgainPhoto } from '@/core/jobs'
import { logger } from '@/core/logger'
import type { PosterContent } from '@/core/poster'
import { loadPosterSetContent } from '@/core/poster/sets'
import type { ObjectStore } from '@/core/storage'
import { storedSlotOrder } from '@/core/templates/image-slots'

// 复用上一期 (ARCHITECTURE §5.3「每周复用」): the owner's newest finished work of this template, or
// of another style in its series, to start this week's poster from. A peek says whether there
// is one (nothing copied); loading it copies its kept photos back to fresh uploads (T40), so
// only a tap on 「用上一期」 does that.

type Deps = { db: SupabaseClient; store: () => ObjectStore }
type Work = Awaited<ReturnType<typeof findLastWorks>>[number]

export type LastPeek = { jobId: string; templateId: string; madeAt: string }

// What the form takes back of a plain template's work (Make again's own fields, againValues).
export type LastFormInputs = Partial<Record<'copy' | 'aspect_ratio' | 'resolution' | 'note' | 'toggles' | 'toggles_confirmed_at', unknown>>

export type LastIssue = LastPeek & { photos: AgainPhoto[] } & (
  | { kind: 'form'; inputs: LastFormInputs }
  | { kind: 'poster'; content: PosterContent }
)

const posterRef = z.object({ set_id: z.uuid() })
const setOf = (work: Work): string | null => {
  const parsed = posterRef.safeParse(work.inputs.poster)
  return parsed.success ? parsed.data.set_id : null
}

const peekOf = (work: Work): LastPeek => ({ jobId: work.id, templateId: work.templateId, madeAt: work.createdAt.toISOString() })

// `templateIds`: the template first, then its series' other styles (any order).
export async function peekLast(db: SupabaseClient, userId: string, templateIds: readonly string[]): Promise<LastPeek | null> {
  const [work] = await findLastWorks(db, userId, templateIds)
  return work ? peekOf(work) : null
}

// Each slot's photo once, newest work first: a poster set's pages each keep their own uploads
// (the prize photo only on the prize page, the QR code on every page).
async function keptPhotos(store: ObjectStore, works: readonly Work[]): Promise<AgainPhoto[]> {
  const photos: AgainPhoto[] = []
  for (const work of works) {
    const slots = storedSlotOrder(work.inputs.input_slots)
    const wanted = slots.some((slot) => !photos.some((photo) => photo.slot === slot))
    if (!wanted || keptInputsOf(work).length === 0) continue
    try {
      for (const photo of await photosForAgain(store, work)) {
        if (!photo.slot || !photos.some((have) => have.slot === photo.slot)) photos.push(photo)
      }
    } catch (error) {
      logger.warn('reuse last: kept photos not copied back', { jobId: work.id, error })
    }
  }
  return photos
}

function formInputs(inputs: Record<string, unknown>): LastFormInputs {
  const { copy, aspect_ratio, resolution, note, toggles, toggles_confirmed_at } = inputs
  return { copy, aspect_ratio, resolution, note, toggles, toggles_confirmed_at }
}

export async function loadLast(deps: Deps, userId: string, templateIds: readonly string[]): Promise<LastIssue | null> {
  const works = await findLastWorks(deps.db, userId, templateIds)
  const [work] = works
  if (!work) return null
  const setId = setOf(work)
  if (!setId) return { ...peekOf(work), kind: 'form', inputs: formInputs(work.inputs), photos: await keptPhotos(deps.store(), [work]) }
  const content = await loadPosterSetContent(deps.db, userId, setId)
  if (!content) return null
  const pages = works.filter((other) => setOf(other) === setId)
  return { ...peekOf(work), kind: 'poster', content, photos: await keptPhotos(deps.store(), pages) }
}
