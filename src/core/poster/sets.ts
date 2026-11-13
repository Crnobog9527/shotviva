import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { requireFeature } from '../features'
import { posterContentSchema, type PosterContent } from './content'
import { splitPoster, type PosterPart } from './split'
import { posterFieldsSchema, type PosterFields } from './template'

// Saving a confirmed set and reading one poster of it back (ARCHITECTURE §5.3, table 1344).
// Service-role client: poster_sets takes no client writes.

export const POSTER_FEATURE = 'dense_poster'
// Sets one account may save per day; each is a few KB, and saving costs nothing but storage.
export const POSTER_SETS_PER_DAY = 60
export const POSTER_SOURCES = ['paste', 'photo', 'reuse', 'manual'] as const
// poster_sets.parts holds at most this many posters (1344).
export const POSTER_PARTS_MAX = 12

export type SavedPosterSet = { id: string; templateId: string; parts: PosterPart[] }

const fail = (message: string) => new AppError('INVALID_INPUT', message)

// The template's set definition, or a refusal when the template makes no posters.
export function posterFieldsOf(fields: { poster?: unknown }): PosterFields {
  const parsed = posterFieldsSchema.safeParse(fields.poster)
  if (!parsed.success) throw fail('This template does not make posters')
  return parsed.data
}

async function assertUnderDailyLimit(db: SupabaseClient, userId: string, now: Date) {
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const { data, error } = await db.from('poster_sets').select('id')
    .eq('user_id', userId).gte('created_at', since).limit(POSTER_SETS_PER_DAY)
  if (error) throw new AppError('INTERNAL', 'poster_sets count failed', { cause: new Error(error.message) })
  if ((data?.length ?? 0) >= POSTER_SETS_PER_DAY) throw new AppError('RATE_LIMITED', 'Too many poster sets today')
}

export type SavePosterSet = {
  userId: string
  templateId: string
  fields: { poster?: unknown }
  content: unknown
  source: (typeof POSTER_SOURCES)[number]
  now?: Date
  // The invite-only gate; tests pass their own reads.
  allow?: (userId: string) => Promise<void>
}

export async function savePosterSet(db: SupabaseClient, input: SavePosterSet): Promise<SavedPosterSet> {
  await (input.allow ?? ((userId: string) => requireFeature(userId, POSTER_FEATURE)))(input.userId)
  const fields = posterFieldsOf(input.fields)
  const content = posterContentSchema.safeParse(input.content)
  if (!content.success) throw fail(content.error.issues[0]?.message ?? 'Invalid poster text')
  const parts = splitPoster(content.data, fields)
  if (parts.length === 0) throw fail('Add some text before making the posters')
  if (parts.length > POSTER_PARTS_MAX) throw fail(`At most ${POSTER_PARTS_MAX} posters per set; shorten the text`)
  await assertUnderDailyLimit(db, input.userId, input.now ?? new Date())
  const { data, error } = await db.from('poster_sets')
    .insert({ user_id: input.userId, template_id: input.templateId, source: input.source, content: content.data, parts })
    .select('id').single<{ id: string }>()
  if (error) throw new AppError('INTERNAL', 'poster_sets insert failed', { cause: new Error(error.message) })
  return { id: data.id, templateId: input.templateId, parts }
}

const storedSetSchema = z.object({ template_id: z.string(), content: z.unknown(), parts: z.array(z.unknown()) })

export type LoadedPosterPart = { content: PosterContent; part: PosterPart }

// One poster of the caller's own set, made with this template. Anything else reads as missing.
export async function loadPosterPart(db: SupabaseClient, userId: string, ref: { setId: string; part: number; templateId: string }): Promise<LoadedPosterPart> {
  const { data, error } = await db.from('poster_sets').select('template_id, content, parts')
    .eq('id', ref.setId).eq('user_id', userId).maybeSingle()
  if (error) throw new AppError('INTERNAL', 'poster_sets read failed', { cause: new Error(error.message) })
  const row = storedSetSchema.safeParse(data)
  if (!row.success || row.data.template_id !== ref.templateId) throw fail('Unknown poster set')
  const part = row.data.parts[ref.part] as PosterPart | undefined
  if (!part) throw fail('Unknown poster in this set')
  return { content: posterContentSchema.parse(row.data.content), part }
}
