'use server'

import { createAdminSupabase, requireUser } from '@/core/auth'
import { clearBillingCommand, saveBillingCommand } from '@/core/org/billing'

// 开票信息 server actions (ARCHITECTURE §6.5). Public endpoints, so each takes the account from
// the server session itself, never from the arguments; the SQL functions accept only the org's
// current owner.
async function deps() {
  const user = await requireUser('/account/enterprise')
  return { db: createAdminSupabase(), user: user.id }
}

export async function saveBillingProfileAction(input: unknown) {
  return saveBillingCommand(await deps(), input)
}

export async function clearBillingProfileAction() {
  return clearBillingCommand(await deps())
}
