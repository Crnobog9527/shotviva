import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '../../billing'
import { afterCursor, decodeCursor, encodeCursor, PAGE_SIZE } from '../cursor'
import { codeRow, inviterRow, redemptionRow, type CodeKind } from './schemas'

export function reportCursor(raw?: string) {
  const cursor = decodeCursor(raw)
  if (!cursor || !z.uuid().safeParse(cursor.i).success || !z.iso.datetime({ offset: true }).safeParse(cursor.c).success) return null
  return { created_at: cursor.c, id: cursor.i }
}

// The SQL reports cap each page at 30. Probe just the next indexed id on a full page;
// another report call would calculate revenue or refund aggregates only to throw them away.
async function reportPage<T extends { created_at: string; id: string }>(db: SupabaseClient, table: string, items: T[], filter?: [string, string]) {
  const last = items.at(-1)
  if (!last || items.length < PAGE_SIZE) return { items, nextCursor: null }
  let probe = db.from(table).select('id').or(afterCursor({ c: last.created_at, i: last.id }))
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1)
  if (filter) probe = probe.eq(...filter)
  const { data, error } = await probe
  if (error) throw error
  return { items, nextCursor: data.length ? encodeCursor(last) : null }
}

export async function listCodes(db: SupabaseClient, actor: string, kind: CodeKind | null, cursor?: string) {
  const items = await callRpc(db, 'admin_list_codes', { p_actor: actor, p_kind: kind, p_cursor: reportCursor(cursor) }, codeRow.array())
  return reportPage(db, 'codes', items, kind ? ['kind', kind] : undefined)
}

export async function loadCode(db: SupabaseClient, actor: string, id: string) {
  if (!z.uuid().safeParse(id).success) return null
  const rows = await callRpc(db, 'admin_list_codes', { p_actor: actor, p_code_id: id }, codeRow.array())
  return rows[0] ?? null
}

export async function redemptions(db: SupabaseClient, actor: string, codeId: string | null, cursor?: string) {
  const rows = await callRpc(db, 'admin_code_redemptions', {
    p_actor: actor, p_code_id: codeId, p_cursor: reportCursor(cursor),
  }, redemptionRow.array())
  const page = await reportPage(db, 'code_redemptions', rows, codeId ? ['code_id', codeId] : ['status', 'blocked_same_ip'])
  return { ...page, observedAt: Date.now() }
}

export async function topInviters(db: SupabaseClient, actor: string, allTime: boolean) {
  return callRpc(db, 'admin_top_inviters', { p_actor: actor, p_days: allTime ? null : 30 }, inviterRow.array())
}
