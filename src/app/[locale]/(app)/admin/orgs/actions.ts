'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'

import { addOrgMember, createOrg, grantOrg, runOrgAction, saveOrg, savePackage, savePaymentAccount, saveSignupBonus, searchPickerUsers, transferOrgOwner, type PickerUser } from '@/core/admin/orgs'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { logger } from '@/core/logger'

// Server actions are public endpoints, so each re-checks the admin role itself (the layout gate
// does not cover them). The E1 SQL functions check the actor again and write the audit log.
async function deps() {
  const admin = await requireAdmin()
  return { db: createAdminSupabase(), actor: admin.id }
}

export async function createOrgAction(input: unknown) {
  const d = await deps()
  const result = await runOrgAction(() => createOrg(d, input))
  if (result.ok) refresh()
  return result
}

export async function saveOrgAction(input: unknown) {
  const d = await deps()
  const result = await runOrgAction(() => saveOrg(d, input))
  if (result.ok) refresh()
  return result
}

export async function grantOrgAction(input: unknown) {
  const d = await deps()
  const result = await runOrgAction(() => grantOrg(d, input))
  if (result.ok) refresh()
  return result
}

export async function savePackageAction(input: unknown) {
  const d = await deps()
  const result = await runOrgAction(() => savePackage(d, input))
  if (result.ok) refresh()
  return result
}

export async function savePaymentAccountAction(input: unknown) {
  const d = await deps()
  const result = await runOrgAction(() => savePaymentAccount(d, input))
  if (result.ok) refresh()
  return result
}

export async function saveSignupBonusAction(input: unknown) {
  const d = await deps()
  const result = await runOrgAction(() => saveSignupBonus(d, input))
  if (result.ok) refresh()
  return result
}

export async function addMemberAction(input: unknown) {
  const d = await deps()
  const result = await runOrgAction(() => addOrgMember(d, input))
  if (result.ok) refresh()
  return result
}

// 更换主管理员 (1930): the org's channel assets stay with the org.
export async function transferOwnerAction(input: unknown) {
  const d = await deps()
  const result = await runOrgAction(() => transferOrgOwner(d, input))
  if (result.ok) refresh()
  return result
}

const searchSchema = z.object({ query: z.string().max(200), orgId: z.uuid().nullable() })

// The user picker's search (new org's owner, 添加成员). Admin only; read only.
export async function searchUsersAction(input: unknown): Promise<{ ok: true; users: PickerUser[] } | { ok: false }> {
  const d = await deps()
  const parsed = searchSchema.safeParse(input)
  if (!parsed.success) return { ok: false }
  try {
    return { ok: true, users: await searchPickerUsers(d.db, parsed.data.query, parsed.data.orgId) }
  } catch (error) {
    logger.error('admin.orgs.picker.failed', { error })
    return { ok: false }
  }
}
