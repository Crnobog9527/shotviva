'use server'

import { refresh } from 'next/cache'

import { adjustUserCredits, banUser, runAdminQuery, unbanUser, type ActionValue } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

// Server actions are public endpoints, so each one re-checks the admin role itself. Inputs
// are validated again in core/admin/users before reaching the SQL function.

function run(work: () => Promise<void>): Promise<ActionValue<null>> {
  return runAdminQuery(async () => {
    await work()
    refresh()
    return null
  })
}

export async function adjustCreditsAction(input: unknown): Promise<ActionValue<null>> {
  await requireAdmin()
  return run(() => adjustUserCredits(createAdminSupabase(), input))
}

export async function banUserAction(input: unknown): Promise<ActionValue<null>> {
  await requireAdmin()
  return run(() => banUser(createAdminSupabase(), input))
}

export async function unbanUserAction(input: unknown): Promise<ActionValue<null>> {
  await requireAdmin()
  return run(() => unbanUser(createAdminSupabase(), input))
}
