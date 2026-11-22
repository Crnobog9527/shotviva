import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { logger } from '../logger'
import { isTemplateShareId, templateShareItemSchema, type TemplateShareInput, type TemplateShareItem } from './rules'

// Template collection share links (ARCHITECTURE §5.1g). Writes take the service-role client and
// the id of a user the caller has already authenticated (migration 1861's functions refuse
// every client); the creator's own list reads on their session, so RLS keeps it to their rows.

export type TemplateShare = {
  id: string
  items: TemplateShareItem[]
  title: string | null
  note: string | null
  createdAt: string
  revokedAt: string | null
}

export const TEMPLATE_SHARES_PAGE = 30

const COLUMNS = 'id, items, title, note, created_at, revoked_at'
type Row = { id: string; items: unknown; title: string | null; note: string | null; created_at: string; revoked_at: string | null }

// Items that no longer parse (never expected: the function checked them) are dropped, not fatal.
const items = z.array(z.unknown()).catch([])
function toShare(row: Row): TemplateShare {
  const parsed = items.parse(row.items).flatMap((item) => {
    const one = templateShareItemSchema.safeParse(item)
    return one.success ? [one.data] : []
  })
  return { id: row.id, items: parsed, title: row.title, note: row.note, createdAt: row.created_at, revokedAt: row.revoked_at }
}

// Exception messages raised by template_share_create.
function toCreateError(error: { message: string }): AppError {
  if (error.message === 'RATE_LIMITED') return new AppError('RATE_LIMITED', 'Too many share links, try again later', { cause: error })
  if (error.message === 'TEMPLATE_NOT_FOUND') return new AppError('NOT_FOUND', 'A picked template is not available', { cause: error })
  if (error.message === 'INVALID_INPUT') return new AppError('INVALID_INPUT', 'Invalid share link', { cause: error })
  return new AppError('INTERNAL', 'share link create failed', { cause: error })
}

export async function createTemplateShare(admin: SupabaseClient, userId: string, input: TemplateShareInput): Promise<string> {
  const { data, error } = await admin.rpc('template_share_create', {
    p_user: userId, p_items: input.items, p_title: input.title ?? null, p_note: input.note ?? null,
  })
  if (error) throw toCreateError(error)
  if (!isTemplateShareId(data)) throw new AppError('INTERNAL', 'share link create returned no id')
  return data
}

// True when this call revoked the link; false for another account's, unknown or already revoked.
export async function revokeTemplateShare(admin: SupabaseClient, userId: string, id: string): Promise<boolean> {
  if (!isTemplateShareId(id)) return false
  const { data, error } = await admin.rpc('template_share_revoke', { p_user: userId, p_id: id })
  if (error) throw new AppError('INTERNAL', 'share link revoke failed', { cause: error })
  return data === true
}

export type ShareCursor = { createdAt: string; id: string }

// The caller's links newest first, a page at a time (keyset on template_shares_user_created_idx).
export async function listTemplateShares(client: SupabaseClient, userId: string, before?: ShareCursor): Promise<TemplateShare[]> {
  let query = client.from('template_shares').select(COLUMNS).eq('user_id', userId)
  if (before) query = query.or(`created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${before.id})`)
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(TEMPLATE_SHARES_PAGE)
    .returns<Row[]>()
  if (error) throw new AppError('INTERNAL', 'share links read failed', { cause: error })
  return data.map(toShare)
}

// One link for the public page, by its primary key, revoked ones included (the page says so).
export async function readTemplateShare(admin: SupabaseClient, id: string): Promise<TemplateShare | null> {
  if (!isTemplateShareId(id)) return null
  const { data, error } = await admin.from('template_shares').select(COLUMNS).eq('id', id).maybeSingle<Row>()
  if (error) throw new AppError('INTERNAL', 'share link read failed', { cause: error })
  return data ? toShare(data) : null
}

// The sharer's partner link slug, when they have an active affiliate account (a personal
// partner, or an enterprise's owner) and the programme is on: their share links carry ?ref=,
// which the proxy records exactly as it does for their own referral link (core/affiliate).
export async function sharerRefSlug(admin: SupabaseClient, userId: string, programmeOn: () => Promise<boolean>): Promise<string | null> {
  const { data, error } = await admin.from('affiliates').select('slug, status').eq('user_id', userId).maybeSingle<{ slug: string; status: string }>()
  if (error) {
    logger.warn('template_share.ref_unavailable', { code: error.code })
    return null
  }
  return data?.status === 'active' && (await programmeOn()) ? data.slug : null
}
