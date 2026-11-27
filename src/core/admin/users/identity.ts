import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import type { UserIdentity } from './list-types'

// Who an account is, for the /admin/users list (Owner 2026-11-23): the admin's own tag (an
// affiliate's admin_label, else admin_user_labels, migration 1994), the affiliate status and note,
// and the org seat (owner or member, and of which org). One read per table for the whole page.

const affiliateRow = z.object({ user_id: z.string(), status: z.string(), admin_label: z.string().nullable(), admin_note: z.string().nullable() })
const labelRow = z.object({ user_id: z.string(), label: z.string() })
const seatRow = z.object({ user_id: z.string(), org_id: z.string(), role: z.enum(['owner', 'member']) })
const orgRow = z.object({ id: z.string(), name: z.string() })

function rows<T>(result: { data: unknown; error: { message: string } | null }, schema: z.ZodType<T>, what: string): T[] {
  if (result.error) throw new AppError('INTERNAL', `admin user identity read failed: ${what}`, { cause: new Error(result.error.message) })
  return z.array(schema).parse(result.data ?? [])
}

export async function readUserIdentities(db: SupabaseClient, ids: readonly string[]): Promise<Map<string, UserIdentity>> {
  if (ids.length === 0) return new Map()
  const list = [...new Set(ids)]
  const [affiliates, labels, seats] = await Promise.all([
    db.from('affiliates').select('user_id,status,admin_label,admin_note').in('user_id', list),
    db.from('admin_user_labels').select('user_id,label').in('user_id', list),
    db.from('org_members').select('user_id,org_id,role').in('user_id', list).eq('status', 'active'),
  ])
  const affiliateBy = new Map(rows(affiliates, affiliateRow, 'affiliates').map((r) => [r.user_id, r]))
  const labelBy = new Map(rows(labels, labelRow, 'labels').map((r) => [r.user_id, r.label]))
  const seatList = rows(seats, seatRow, 'seats')
  const orgIds = [...new Set(seatList.map((s) => s.org_id))]
  const orgs = orgIds.length ? rows(await db.from('orgs').select('id,name').in('id', orgIds), orgRow, 'orgs') : []
  const orgName = new Map(orgs.map((o) => [o.id, o.name]))
  const seatBy = new Map(seatList.map((s) => [s.user_id, s]))
  return new Map(list.map((id) => {
    const affiliate = affiliateBy.get(id)
    const seat = seatBy.get(id)
    return [id, {
      label: affiliate?.admin_label ?? labelBy.get(id) ?? null,
      affiliate: affiliate ? { status: affiliate.status, note: affiliate.admin_note } : null,
      org: seat ? { role: seat.role, name: orgName.get(seat.org_id) ?? null } : null,
    }]
  }))
}

// The list still shows without these facts when a read fails (or before migration 1994 has run).
export async function pageIdentities(db: SupabaseClient, ids: readonly string[]): Promise<Map<string, UserIdentity>> {
  try {
    return await readUserIdentities(db, ids)
  } catch (error) {
    logger.warn('admin.users.identity_unavailable', { error })
    return new Map()
  }
}
