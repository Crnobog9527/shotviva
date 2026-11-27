import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { accountContact } from './label'
import type { UserReferrer } from './list-types'

// Who brought an account in (联盟营销 上家), for the /admin/users list and detail. The binding sits
// on profiles (referred_by → affiliates.user_id, 0900; org level and member in 1640), so the list
// reads it in three batched queries for the whole page (profiles by primary key, affiliates by
// primary key, orgs by primary key), never one per row. Server-side, service role, admin pages only.

const bindingRow = z.object({
  id: z.string(),
  referred_by: z.string(),
  referred_at: z.string().nullable(),
  referred_source: z.string().nullable(),
  referred_member: z.string().nullable(),
  referred_via: z.string().nullable(),
})
const partnerRow = z.object({
  user_id: z.string(),
  slug: z.string(),
  status: z.string(),
  admin_label: z.string().nullable(),
  org_id: z.string().nullable(),
  name: z.string().nullable(),
})
const orgRow = z.object({ id: z.string(), name: z.string() })

function rows<T>(result: { data: unknown; error: { message: string } | null }, schema: z.ZodType<T>, what: string): T[] {
  if (result.error) throw new AppError('INTERNAL', `admin user referrer read failed: ${what}`, { cause: new Error(result.error.message) })
  return z.array(schema).parse(result.data ?? [])
}

// The partner's name for the admin: the admin's own tag, else the org name for an enterprise
// account, else the name on the application, else the referral code.
export const partnerName = (p: { admin_label: string | null; name: string | null; slug: string }, org: string | null) =>
  p.admin_label || org || p.name?.trim() || p.slug

export async function readUserReferrers(db: SupabaseClient, ids: readonly string[]): Promise<Map<string, UserReferrer>> {
  const out = new Map<string, UserReferrer>()
  if (ids.length === 0) return out
  const bindings = rows(
    await db.from('profiles')
      .select('id,referred_by,referred_at,referred_source,referred_member,referred_via')
      .in('id', [...new Set(ids)]).not('referred_by', 'is', null),
    bindingRow, 'bindings',
  )
  if (bindings.length === 0) return out
  const partnerIds = [...new Set(bindings.map((b) => b.referred_by))]
  const partners = rows(
    await db.from('affiliates').select('user_id,slug,status,admin_label,org_id,name:application->>name').in('user_id', partnerIds),
    partnerRow, 'partners',
  )
  const orgIds = [...new Set(partners.flatMap((p) => (p.org_id ? [p.org_id] : [])))]
  const orgs = orgIds.length ? rows(await db.from('orgs').select('id,name').in('id', orgIds), orgRow, 'orgs') : []
  const orgName = new Map(orgs.map((o) => [o.id, o.name]))
  const partnerBy = new Map(partners.map((p) => [p.user_id, p]))
  for (const b of bindings) {
    const p = partnerBy.get(b.referred_by)
    if (!p) continue
    out.set(b.id, {
      partnerId: p.user_id,
      name: partnerName(p, p.org_id ? (orgName.get(p.org_id) ?? null) : null),
      slug: p.slug,
      status: p.status,
      enterprise: p.org_id !== null,
      source: b.referred_source,
      at: b.referred_at,
      memberId: b.referred_member,
      viaId: b.referred_via,
    })
  }
  return out
}

// The list still shows without the tag when a read fails (or before migration 1640 has run).
export async function pageReferrers(db: SupabaseClient, ids: readonly string[]): Promise<Map<string, UserReferrer>> {
  try {
    return await readUserReferrers(db, ids)
  } catch (error) {
    logger.warn('admin.users.referrer_unavailable', { error })
    return new Map()
  }
}

// The detail adds how to reach the partner and the colleague or customer who passed the link on:
// at most three Auth reads for one account.
export async function readReferrerDetail(db: SupabaseClient, userId: string): Promise<UserReferrer | null> {
  let referrer: UserReferrer | undefined
  try {
    referrer = (await readUserReferrers(db, [userId])).get(userId)
  } catch (error) {
    logger.warn('admin.users.referrer_unavailable', { error })
    return null
  }
  if (!referrer) return null
  const contact = async (id: string | null) => {
    if (!id) return null
    const { data } = await db.auth.admin.getUserById(id)
    return data.user ? accountContact(data.user) : null
  }
  const [partnerContact, memberContact, viaContact] = await Promise.all([contact(referrer.partnerId), contact(referrer.memberId), contact(referrer.viaId)])
  return { ...referrer, partnerContact, memberContact, viaContact }
}
