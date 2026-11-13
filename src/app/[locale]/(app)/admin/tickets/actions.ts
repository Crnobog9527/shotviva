'use server'

import { refresh } from 'next/cache'
import { after } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'

import { runAdminAction, type ActionResult } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { serverEnv } from '@/core/env'
import { AppError } from '@/core/errors'
import { appOrigin } from '@/core/site-url'
import { r2Store } from '@/core/storage'
import {
  decideRefund,
  loadRenewalReview,
  notifyTicketReply,
  resolveRenewal,
  replyTicket,
  ticketAuthor,
  withTicketImages,
} from '@/core/support'
import { site } from '@/site/site.config'

// Server actions are public endpoints, so each re-checks the admin role itself. Inputs are
// validated again in core/support before reaching the SQL function. Neither moves money.

const replyImages = z.object({
  ticketId: z.string(),
  body: z.string().default(''),
  images: z.array(z.string()).default([]),
  close: z.boolean().optional(),
})

// D13: once a reply is saved, email its author that there is one (core/support/reply-email).
// Scheduled with after() so the Owner never waits on it, and only after the reply succeeded;
// notifyTicketReply never throws, so a failed email cannot touch the saved reply.
function emailAuthorAfterReply(ticketId: string) {
  after(() =>
    notifyTicketReply(
      {
        db: createAdminSupabase(),
        apiKey: serverEnv().RESEND_API_KEY,
        from: `${site.brand.name} <${site.brand.authEmail}>`,
        origin: appOrigin,
        translate: (locale) => getTranslations({ locale, namespace: 'supportEmail' }),
      },
      ticketId,
    ),
  )
}

// The reply's images (T69) were uploaded by the admin (their inputs/ keys) and are filed under
// the ticket's author, so the author's account deletion removes them too.
export async function replyTicketAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    const db = createAdminSupabase()
    const parsed = replyImages.safeParse(input)
    if (!parsed.success) throw new AppError('INVALID_INPUT', '回复内容无效')
    const { ticketId, images: keys } = parsed.data
    if (parsed.data.close) {
      const review = await loadRenewalReview(db, ticketId)
      if (review && !review.resolution) throw new AppError('CONFLICT', '请先核对本期续费')
    }
    const authorId = keys.length > 0 ? await ticketAuthor(db, ticketId) : null
    if (keys.length > 0 && !authorId) throw new AppError('NOT_FOUND', '工单不存在')
    await withTicketImages(r2Store(), { uploaderId: admin.id, authorId: authorId ?? admin.id, ticketId }, keys, (images) =>
      replyTicket(db, input, images),
    )
    // A bare close (no text) is not a reply, so it sends nothing.
    if (parsed.data.body.trim()) emailAuthorAfterReply(ticketId)
    refresh()
  })
}

export async function decideRefundAction(input: unknown): Promise<ActionResult> {
  await requireAdmin()
  return runAdminAction(async () => {
    await decideRefund(createAdminSupabase(), input)
    // The decision is posted to the ticket as a reply (admin_decide_refund), so it is emailed too.
    const ticketId = z.object({ ticketId: z.string() }).safeParse(input)
    if (ticketId.success) emailAuthorAfterReply(ticketId.data.ticketId)
    refresh()
  })
}

export async function resolveRenewalAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await resolveRenewal(createAdminSupabase(), admin.id, input)
    refresh()
  })
}
