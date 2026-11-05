import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  activationInputSchema,
  adminRowSchema,
  announcementInputSchema,
  type AdminAnnouncementRow,
  type AnnouncementInput,
} from '@/core/announcements/rules'
import { AppError } from '@/core/errors'

import { afterCursor, decodeCursor, PAGE_SIZE, toPage, type Page } from '../cursor'
import { ANNOUNCEMENT_ERRORS } from './errors'

// /admin/announcements data (ARCHITECTURE §10). Service-role client only: the table refuses
// every client role. Each action is one database round trip.

const ADMIN_COLUMNS =
  'id, message_en, message_zh, link_url, link_label_en, link_label_zh, tone, starts_at, ends_at, is_active, created_at, updated_at'

const fail = (what: string, error: { message: string }): never => {
  throw new AppError('INTERNAL', `site_announcements ${what} failed`, { cause: new Error(error.message) })
}

// Newest first; index site_announcements_created_at_id_idx. readAt is when the rows were
// read, so the page labels live / scheduled / ended as of that moment.
export async function listAnnouncements(
  db: SupabaseClient,
  cursor?: string | null,
): Promise<Page<AdminAnnouncementRow> & { readAt: number }> {
  let query = db
    .from('site_announcements')
    .select(ADMIN_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
  const after = decodeCursor(cursor)
  if (after) query = query.or(afterCursor(after))
  const { data, error } = await query
  if (error) fail('list', error)
  return { ...toPage(adminRowSchema.array().parse(data), (row) => row), readAt: Date.now() }
}

function parseInput(input: unknown): AnnouncementInput {
  const parsed = announcementInputSchema.safeParse(input)
  if (parsed.success) return parsed.data
  const field = parsed.error.issues[0]?.message === 'link' ? 'link' : parsed.error.issues[0]?.message === 'window' ? 'window' : 'input'
  throw new AppError('INVALID_INPUT', ANNOUNCEMENT_ERRORS[field])
}

const toColumns = (input: AnnouncementInput, actorId: string) => ({
  message_en: input.messageEn,
  message_zh: input.messageZh,
  link_url: input.linkUrl,
  link_label_en: input.linkLabelEn,
  link_label_zh: input.linkLabelZh,
  tone: input.tone,
  starts_at: input.startsAt,
  ends_at: input.endsAt,
  updated_by: actorId,
})

// Insert or update in one statement. New rows start switched off; switching on goes through
// admin_activate_announcement. Editing an active row into another active row's window is
// refused by the exclusion constraint (23P01).
export async function saveAnnouncement(db: SupabaseClient, actorId: string, input: unknown): Promise<string> {
  const parsed = parseInput(input)
  const columns = toColumns(parsed, actorId)
  const { data, error } = parsed.id
    ? await db.from('site_announcements').update(columns).eq('id', parsed.id).select('id').maybeSingle()
    : await db.from('site_announcements').insert(columns).select('id').single()
  if (error?.code === '23P01') throw new AppError('CONFLICT', ANNOUNCEMENT_ERRORS.overlap)
  if (error) fail('save', error)
  if (!data) throw new AppError('NOT_FOUND', ANNOUNCEMENT_ERRORS.notFound)
  return (data as { id: string }).id
}

// Switch on (stopping any active one whose window overlaps) or off. Returns the stopped ids.
export async function setAnnouncementActive(db: SupabaseClient, actorId: string, input: unknown): Promise<string[]> {
  const parsed = activationInputSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', ANNOUNCEMENT_ERRORS.input)
  const { data, error } = await db.rpc('admin_activate_announcement', {
    p_id: parsed.data.id,
    p_active: parsed.data.active,
    p_actor: actorId,
  })
  if (error?.message === 'ANNOUNCEMENT_NOT_FOUND') throw new AppError('NOT_FOUND', ANNOUNCEMENT_ERRORS.notFound)
  if (error) fail('activate', error)
  return (data as string[] | null) ?? []
}
