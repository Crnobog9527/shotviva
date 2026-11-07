'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'

import { runAdminAction, type ActionResult } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { r2Store } from '@/core/storage'
import { decideRefund, replyTicket, ticketAuthor, withTicketImages } from '@/core/support'

// Server actions are public endpoints, so each re-checks the admin role itself. Inputs are
// validated again in core/support before reaching the SQL function. Neither moves money.

const replyImages = z.object({ ticketId: z.string(), images: z.array(z.string()).default([]) })

// The reply's images (T69) were uploaded by the admin (their inputs/ keys) and are filed under
// the ticket's author, so the author's account deletion removes them too.
export async function replyTicketAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    const db = createAdminSupabase()
    const parsed = replyImages.safeParse(input)
    if (!parsed.success) throw new AppError('INVALID_INPUT', '回复内容无效')
    const { ticketId, images: keys } = parsed.data
    const authorId = keys.length > 0 ? await ticketAuthor(db, ticketId) : null
    if (keys.length > 0 && !authorId) throw new AppError('NOT_FOUND', '工单不存在')
    await withTicketImages(r2Store(), { uploaderId: admin.id, authorId: authorId ?? admin.id, ticketId }, keys, (images) =>
      replyTicket(db, input, images),
    )
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
