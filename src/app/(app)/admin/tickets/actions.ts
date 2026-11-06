'use server'

import { refresh } from 'next/cache'

import { runAdminAction, type ActionResult } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { decideRefund, replyTicket } from '@/core/support'

// Server actions are public endpoints, so each re-checks the admin role itself. Inputs are
// validated again in core/support before reaching the SQL function. Neither moves money.

export async function replyTicketAction(input: unknown): Promise<ActionResult> {
  await requireAdmin()
  return runAdminAction(async () => {
    await replyTicket(createAdminSupabase(), input)
    refresh()
  })
}

export async function decideRefundAction(input: unknown): Promise<ActionResult> {
  await requireAdmin()
  return runAdminAction(async () => {
    await decideRefund(createAdminSupabase(), input)
    refresh()
  })
}
