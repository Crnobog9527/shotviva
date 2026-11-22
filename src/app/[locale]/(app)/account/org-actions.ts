'use server'

import { refresh } from 'next/cache'

import { createAdminSupabase, requireUser } from '@/core/auth'
import { orgCommands } from '@/core/org/console'
import { clearJoinIntent } from '@/core/org/join-intent'
import type { ConsoleResult } from '@/core/org/console'

// Server actions of the account centre's enterprise block. They are public endpoints, so each
// takes the account from the server session itself (never from the arguments) and the command
// checks that account owns an org before calling the E1 SQL functions, which check it again.
// Request ids come from the forms and are namespaced in core/org/console.
async function deps() {
  const user = await requireUser('/account/enterprise')
  return { db: createAdminSupabase(), user: user.id }
}

async function applied<T extends ConsoleResult<object>>(result: T): Promise<T> {
  if (result.ok) refresh()
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

export async function removeMemberAction(input: unknown) {
  return applied(await orgCommands.removeMember(await deps(), input))
}

export async function resetInviteAction() {
  return applied(await orgCommands.resetInvite(await deps()))
}

export async function leaveOrgAction(input: unknown) {
  return applied(await orgCommands.leave(await deps(), input))
}

export async function joinOrgAction(token: string) {
  const user = await requireUser(`/join/org/${encodeURIComponent(token)}`)
  // The sign-up mark is used once, whatever the outcome (core/org/join-intent.ts).
  await clearJoinIntent()
  return applied(await orgCommands.join({ db: createAdminSupabase(), user: user.id }, token))
}
