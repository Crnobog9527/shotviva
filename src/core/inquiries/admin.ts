import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { afterCursor, decodeCursor, PAGE_SIZE, toPage, type Page } from '../admin/cursor'
import { AppError } from '../errors'
import {
  INQUIRY_NEEDS,
  INQUIRY_PAGES,
  INQUIRY_PLATFORMS,
  INQUIRY_STATUSES,
  INQUIRY_USES,
  LIMITS,
  MONTHLY_VOLUMES,
  START_TIMES,
  TEAM_SIZES,
  type InquiryStatus,
} from './rules'

// /admin/inquiries (ARCHITECTURE §10.c): service-role client only; pages and actions call
// requireAdmin() first. Newest first, keyset on (created_at, id), one page at a time.

export type InquiryFilter = { status: InquiryStatus | 'all' }
export const inquiryFilterSchema = z.object({ status: z.enum([...INQUIRY_STATUSES, 'all']).catch('all') })

const LIST_COLUMNS = 'id, created_at, company, name, email, monthly_volume, uses, status'

const listRow = z.object({
  id: z.uuid(),
  created_at: z.string(),
  company: z.string(),
  name: z.string(),
  email: z.string(),
  monthly_volume: z.enum(MONTHLY_VOLUMES),
  uses: z.array(z.enum(INQUIRY_USES)),
  status: z.enum(INQUIRY_STATUSES),
})
export type AdminInquiryRow = z.infer<typeof listRow>

const DETAIL_COLUMNS = `${LIST_COLUMNS}, updated_at, locale, page, user_id, message, job_title, website, wechat, phone, team_size, country, platforms, needs, start_time, admin_note`

const detailRow = listRow.extend({
  updated_at: z.string(),
  locale: z.enum(['en', 'zh']),
  page: z.enum(INQUIRY_PAGES),
  user_id: z.uuid().nullable(),
  message: z.string(),
  job_title: z.string().nullable(),
  website: z.string().nullable(),
  wechat: z.string().nullable(),
  phone: z.string().nullable(),
  team_size: z.enum(TEAM_SIZES).nullable(),
  country: z.string().nullable(),
  platforms: z.array(z.enum(INQUIRY_PLATFORMS)),
  needs: z.array(z.enum(INQUIRY_NEEDS)),
  start_time: z.enum(START_TIMES).nullable(),
  admin_note: z.string().nullable(),
})
export type AdminInquiry = z.infer<typeof detailRow>

function readFailed(what: string, error: { message: string }): never {
  throw new AppError('INTERNAL', `business inquiries ${what} failed`, { cause: new Error(error.message) })
}

// business_inquiries_created_at_idx for "all", business_inquiries_status_created_at_idx by status.
export async function listAdminInquiries(db: SupabaseClient, filter: InquiryFilter, rawCursor?: string | null): Promise<Page<AdminInquiryRow>> {
  let query = db.from('business_inquiries').select(LIST_COLUMNS)
  if (filter.status !== 'all') query = query.eq('status', filter.status)
  const cursor = decodeCursor(rawCursor)
  if (cursor) query = query.or(afterCursor(cursor))
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1)
  if (error) readFailed('list', error)
  return toPage(listRow.array().parse(data), (row) => row)
}

export async function loadAdminInquiry(db: SupabaseClient, id: string): Promise<AdminInquiry | null> {
  if (!z.uuid().safeParse(id).success) return null
  const { data, error } = await db.from('business_inquiries').select(DETAIL_COLUMNS).eq('id', id).maybeSingle()
  if (error) readFailed('read', error)
  return data ? detailRow.parse(data) : null
}

// The nav badge: an exact count of status = 'new' on business_inquiries_status_created_at_idx.
export async function newInquiryCount(db: SupabaseClient): Promise<number> {
  const { count, error } = await db.from('business_inquiries').select('id', { count: 'exact' }).eq('status', 'new').limit(1)
  if (error) readFailed('count', error)
  return count ?? 0
}

export const updateInquirySchema = z.object({
  id: z.uuid(),
  status: z.enum(INQUIRY_STATUSES),
  // An emptied note is stored as null.
  note: z
    .string()
    .max(LIMITS.adminNote)
    .transform((note) => note.trim() || null),
})

// One update by primary key: status and note together, as the detail page saves them.
export async function updateInquiry(db: SupabaseClient, input: unknown): Promise<void> {
  const parsed = updateInquirySchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'inquiry update is invalid')
  const { id, status, note } = parsed.data
  const { data, error } = await db
    .from('business_inquiries')
    .update({ status, admin_note: note, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) readFailed('update', error)
  if (data.length === 0) throw new AppError('NOT_FOUND', 'inquiry not found')
}
