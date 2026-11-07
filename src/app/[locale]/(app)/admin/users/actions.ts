'use server'

import { refresh } from 'next/cache'

import {
  adjustUserCredits,
  banUser,
  batchAdjustCredits,
  batchSetBanned,
  loadUserDetail,
  runAdminQuery,
  unbanUser,
  type ActionValue,
  type BatchOutcome,
  type UserDetailData,
} from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

// Server actions are public endpoints, so each one re-checks the admin role itself. Inputs
// are validated again in core/admin/users before reaching the SQL function.

function run<T>(work: () => Promise<T>): Promise<ActionValue<T>> {
  return runAdminQuery(async () => {
    const value = await work()
    refresh()
    return value
  })
}

export async function adjustCreditsAction(input: unknown): Promise<ActionValue<null>> {
  await requireAdmin()
  return run(async () => {
    await adjustUserCredits(createAdminSupabase(), input)
    return null
  })
}

export async function banUserAction(input: unknown): Promise<ActionValue<null>> {
  await requireAdmin()
  return run(async () => {
    await banUser(createAdminSupabase(), input)
    return null
  })
}

export async function unbanUserAction(input: unknown): Promise<ActionValue<null>> {
  await requireAdmin()
  return run(async () => {
    await unbanUser(createAdminSupabase(), input)
    return null
  })
}

// The user detail dialog (T77) reads through this, over any admin page. Read only: no refresh.
export async function userDetailAction(input: unknown): Promise<ActionValue<UserDetailData | null>> {
  await requireAdmin()
  return runAdminQuery(() => loadUserDetail(createAdminSupabase(), input))
}

// Batch actions on the users list (T77): all or nothing, at most 50 users.
export async function batchAdjustCreditsAction(input: unknown): Promise<ActionValue<BatchOutcome>> {
  await requireAdmin()
  return run(() => batchAdjustCredits(createAdminSupabase(), input))
}

export async function batchSetBannedAction(input: unknown): Promise<ActionValue<BatchOutcome>> {
  await requireAdmin()
  return run(() => batchSetBanned(createAdminSupabase(), input))
}
