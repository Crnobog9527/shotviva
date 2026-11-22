'use server'

import { refresh } from 'next/cache'

import { createAdminSupabase, requireUser } from '@/core/auth'
import { orgCommands } from '@/core/org/console'
import type { ConsoleResult } from '@/core/org/console'

// Server actions of the account centre's enterprise block. They are public endpoints, so each
// takes the account from the server session itself (never from the arguments) and the command
// checks that account owns an org before calling the E1 SQL functions, which check it again.
// Request ids come from the forms and are namespaced in core/org/console.
async function deps() {
  const user = await requireUser('/account/enterprise')
  return { db: createAdminSupabase(), user: user.id }
}

// A refused give because the pool is short also refreshes: the page's pool number was stale.
async function applied<T extends ConsoleResult<object>>(result: T): Promise<T> {
  if (result.ok || result.error === 'POOL_INSUFFICIENT') refresh()
  return result
}

export async function depositAction(input: unknown) {
  return applied(await orgCommands.deposit(await deps(), input))
}

export async function allocateAction(input: unknown) {
  return applied(await orgCommands.allocate(await deps(), input))
}

export async function setAllowanceAction(input: unknown) {
  return applied(await orgCommands.setAllowance(await deps(), input))
}

export async function allocatePromoAction(input: unknown) {
  return applied(await orgCommands.allocatePromo(await deps(), input))
}

export async function setPromoAllowanceAction(input: unknown) {
  return applied(await orgCommands.setPromoAllowance(await deps(), input))
}

export async function setDefaultsAction(input: unknown) {
  return applied(await orgCommands.setDefaults(await deps(), input))
}

export async function bulkSetAllowanceAction(input: unknown) {
  return applied(await orgCommands.bulkSetAllowance(await deps(), input))
}

export async function bulkGrantAction(input: unknown) {
  return applied(await orgCommands.bulkGrant(await deps(), input))
}

// The pools now, read before a bulk give is confirmed; refreshes the page so every number agrees.
export async function poolsAction() {
  const result = await orgCommands.pools(await deps())
  if (result.ok) refresh()
  return result
}

export async function removeMemberAction(input: unknown) {
  return applied(await orgCommands.removeMember(await deps(), input))
}

export async function resetInviteAction() {
  return applied(await orgCommands.resetInvite(await deps()))
}

export async function joinOrgAction(token: string) {
  const user = await requireUser(`/join/org/${encodeURIComponent(token)}`)
  return applied(await orgCommands.join({ db: createAdminSupabase(), user: user.id }, token))
}
