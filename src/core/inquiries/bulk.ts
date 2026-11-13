import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import type { BulkOutcome } from '../admin/shell/bulk/bulk-outcome'
import { PAGE_SIZE } from '../admin/cursor'
import { AppError } from '../errors'
import { loadAdminInquiries, type AdminInquiry } from './admin'
import { INQUIRY_STATUSES, type BulkInquirySkip } from './rules'

const ids = z.array(z.uuid()).min(1).max(PAGE_SIZE)
export const bulkStatusSchema = z.object({ ids, status: z.enum(INQUIRY_STATUSES) })

function failed(what: string, error: { message: string }): never {
  throw new AppError('INTERNAL', `business inquiries ${what} failed`, { cause: new Error(error.message) })
}

// The follow-up status of up to a page of inquiries; notes are left as they are. One read to
// sort each id into changes / already there / gone, then one update by primary key of the ones
// that change (the `neq` keeps a row someone else moved meanwhile from being counted twice).
export async function setInquiriesStatus(db: SupabaseClient, input: unknown): Promise<BulkOutcome<BulkInquirySkip>> {
  const parsed = bulkStatusSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'inquiry batch is invalid')
  const { status } = parsed.data
  const picked = [...new Set(parsed.data.ids)]
  const read = await db.from('business_inquiries').select('id, status').in('id', picked)
  if (read.error) failed('bulk read', read.error)
  const current = new Map(z.object({ id: z.uuid(), status: z.string() }).array().parse(read.data).map((row) => [row.id, row.status]))
  const change = picked.filter((id) => current.has(id) && current.get(id) !== status)
  let changed = new Set<string>()
  if (change.length > 0) {
    const write = await db.from('business_inquiries').update({ status, updated_at: new Date().toISOString() }).in('id', change).neq('status', status).select('id')
    if (write.error) failed('bulk update', write.error)
    changed = new Set(z.object({ id: z.uuid() }).array().parse(write.data).map((row) => row.id))
  }
  const outcome: BulkOutcome<BulkInquirySkip> = { done: [], skipped: [] }
  for (const id of picked) {
    if (changed.has(id)) outcome.done.push(id)
    else outcome.skipped.push({ id, reason: current.has(id) ? 'same' : 'missing' })
  }
  return outcome
}

// Every field of the ticked inquiries, for the CSV the admin downloads (built in the browser).
export async function exportInquiries(db: SupabaseClient, input: unknown): Promise<AdminInquiry[]> {
  const parsed = ids.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'inquiry batch is invalid')
  return loadAdminInquiries(db, parsed.data)
}
