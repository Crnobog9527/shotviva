import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'

import { listUsers } from '../users/list'
import { PICKER_LIMIT, PICKER_MIN_CHARS } from './picker-constants'

// The registered-user picker of /admin/orgs (new org's owner, 添加成员) and the dossier's
// 「设为企业主管理员」. It reuses the admin user search (admin_list_users: email and phone
// substring; accounts have no other display name) and marks, before submit, who cannot take the
// role. The SQL functions (admin_org_create, admin_org_add_member) check every rule again.


// ok: can be picked. The rest are why not: banned; already an active member or owner of an org
// (orgName, role); an open personal affiliate account (ORG_PERSONAL_AFFILIATE); already a member
// of the org being edited (member picker only).
export type PickerStatus = 'ok' | 'banned' | 'in_org' | 'in_this_org' | 'personal_affiliate'

export type PickerUser = {
  id: string
  email: string | null
  phone: string | null
  createdAt: string
  tier: string | null
  status: PickerStatus
  orgName: string | null
  orgRole: 'owner' | 'member' | null
}

type Base = { id: string; email: string | null; phone: string | null; createdAt: string; tier: string | null; banned: boolean }

const membershipSchema = z.object({ user_id: z.uuid(), org_id: z.uuid(), role: z.enum(['owner', 'member']) })
const orgNameSchema = z.object({ id: z.uuid(), name: z.string() })
const affiliateSchema = z.object({ user_id: z.uuid() })

function fail(what: string, error: { message: string }): never {
  throw new AppError('INTERNAL', `admin org picker: ${what} failed`, { cause: new Error(error.message) })
}

async function annotate(db: SupabaseClient, base: Base[], orgId: string | null): Promise<PickerUser[]> {
  if (base.length === 0) return []
  const ids = base.map((user) => user.id)
  const [members, affiliates] = await Promise.all([
    db.from('org_members').select('user_id,org_id,role').in('user_id', ids).eq('status', 'active'),
    db.from('affiliates').select('user_id').in('user_id', ids).is('org_id', null).in('status', ['pending', 'active']),
  ])
  if (members.error) fail('members', members.error)
  if (affiliates.error) fail('affiliates', affiliates.error)
  const memberships = new Map(membershipSchema.array().parse(members.data).map((row) => [row.user_id, row]))
  const personal = new Set(affiliateSchema.array().parse(affiliates.data).map((row) => row.user_id))
  const orgIds = [...new Set([...memberships.values()].map((row) => row.org_id))]
  const names = new Map<string, string>()
  if (orgIds.length > 0) {
    const orgs = await db.from('orgs').select('id,name').in('id', orgIds)
    if (orgs.error) fail('orgs', orgs.error)
    for (const org of orgNameSchema.array().parse(orgs.data)) names.set(org.id, org.name)
  }
  return base.map((user) => {
    const membership = memberships.get(user.id)
    const status: PickerStatus = user.banned ? 'banned'
      : membership?.org_id === orgId ? 'in_this_org'
        : membership ? 'in_org'
          : personal.has(user.id) ? 'personal_affiliate' : 'ok'
    return {
      id: user.id, email: user.email, phone: user.phone, createdAt: user.createdAt, tier: user.tier, status,
      orgName: membership ? (names.get(membership.org_id) ?? null) : null, orgRole: membership?.role ?? null,
    }
  })
}

// Substring search over email and phone, the newest accounts first. A query shorter than
// PICKER_MIN_CHARS finds nothing (the box would otherwise list everyone). `orgId` is the org a
// member is being added to; null when picking an owner.
export async function searchPickerUsers(db: SupabaseClient, query: string, orgId: string | null): Promise<PickerUser[]> {
  const q = query.trim()
  if (q.length < PICKER_MIN_CHARS) return []
  const page = await listUsers(db, { q })
  if (page.unavailable) throw new AppError('INTERNAL', 'admin_list_users is not available')
  const base = page.rows.slice(0, PICKER_LIMIT).map((row) => ({
    id: row.id, email: row.email, phone: row.phone, createdAt: row.createdAt, tier: row.tier, banned: row.bannedAt !== null,
  }))
  return annotate(db, base, orgId)
}

// One account by id, for the create form opened from a user's dossier (?owner=). Null when the
// id is not a registered account.
export async function loadPickerUser(db: SupabaseClient, userId: string): Promise<PickerUser | null> {
  if (!z.uuid().safeParse(userId).success) return null
  const [auth, profile] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from('profiles').select('banned_at').eq('id', userId).maybeSingle(),
  ])
  if (auth.error || !auth.data.user || profile.error || !profile.data) return null
  const user = auth.data.user
  const banned = z.object({ banned_at: z.string().nullable() }).parse(profile.data).banned_at !== null
  const [picked] = await annotate(db, [{
    id: user.id, email: user.email ?? null, phone: user.phone || null, createdAt: user.created_at, tier: null, banned,
  }], null)
  return picked ?? null
}
