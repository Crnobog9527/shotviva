'use server'

import { refresh } from 'next/cache'

import { createOrg, grantOrg, runOrgAction, saveOrg, savePackage, savePaymentAccount } from '@/core/admin/orgs'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

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
