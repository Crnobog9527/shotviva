import { z } from 'zod'

import { attachmentFor, BODY_MAX, TICKET_STATUSES, TICKET_TYPES } from './rules'

// Inputs from the browser (AGENTS §4). Ids that do not parse read as "not found" further on.

const body = z.string().trim().min(1).max(BODY_MAX)
// FormData sends '' for an untouched select.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional())

export const createTicketSchema = z
  .object({
    type: z.enum(TICKET_TYPES),
    body,
    paymentId: optional(z.coerce.number().int().positive()),
    jobId: optional(z.uuid()),
  })
  // Attachments the type does not take are dropped rather than refused: the form hides them.
  .transform((input) => {
    const kind = attachmentFor(input.type)
    return {
      type: input.type,
      body: input.body,
      paymentId: kind === 'payment' || kind === 'payment-required' ? (input.paymentId ?? null) : null,
      jobId: kind === 'work' ? (input.jobId ?? null) : null,
    }
  })
  .refine((input) => attachmentFor(input.type) !== 'payment-required' || input.paymentId !== null, {
    path: ['paymentId'],
    message: 'payment required',
  })
export type CreateTicketInput = z.output<typeof createTicketSchema>

export const ticketIdSchema = z.uuid()

export const addMessageSchema = z.object({ ticketId: ticketIdSchema, body })

export const adminReplySchema = z
  .object({ ticketId: ticketIdSchema, body: z.string().trim().max(BODY_MAX), close: z.boolean() })
  .refine((input) => input.close || input.body.length > 0, { path: ['body'], message: 'reply required' })

export const decideRefundSchema = z.discriminatedUnion('decision', [
  z.object({ ticketId: ticketIdSchema, decision: z.literal('approved'), amountCents: z.number().int().positive(), body }),
  z.object({ ticketId: ticketIdSchema, decision: z.literal('rejected'), body }),
])
export type DecideRefundInput = z.infer<typeof decideRefundSchema>

export const adminListFilterSchema = z.object({
  // 'all' is the Owner's look-back; open is the default view.
  status: z.enum([...TICKET_STATUSES, 'all']).catch('open'),
  type: z.enum(TICKET_TYPES).optional().catch(undefined),
})
export type AdminListFilter = z.infer<typeof adminListFilterSchema>
