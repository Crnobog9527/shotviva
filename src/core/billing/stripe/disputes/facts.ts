import { z } from 'zod'

// What dispute_evidence_facts (0728) answers, parsed (AGENTS §4: every outside input). Pure so
// the evidence builder and its tests share it without a database.

const time = z.string().transform((value) => new Date(value))
const nullableTime = time.nullable()
const ip = z.string().nullable()

const workSchema = z.object({
  created_at: time,
  client_ip: ip,
  template_id: z.string(),
  credits_cost: z.number().int(),
  resolution: z.string().nullable(),
  downloaded_at: nullableTime,
  download_ip: ip,
  download_count: z.number().int(),
})

export const evidenceFactsSchema = z.object({
  dispute: z.object({
    id: z.string(),
    charge_id: z.string(),
    amount: z.number().int(),
    currency: z.string(),
    reason: z.string(),
    responder: z.enum(['shotviva', 'stripe']),
    created_at: time,
  }),
  user: z
    .object({ id: z.uuid(), email: z.string().nullable(), signed_up_at: nullableTime, signup_ip: ip, banned_at: nullableTime })
    .nullable(),
  payment: z
    .object({
      id: z.number().int(),
      product_id: z.string(),
      method: z.string(),
      amount_total: z.number().int(),
      currency: z.string(),
      created_at: time,
      renewal: z.boolean(),
      purchase_ip: ip,
      purchase_user_agent: z.string().nullable(),
      terms_accepted_at: nullableTime,
      context_from: z.enum(['this_payment', 'first_payment']).nullable(),
    })
    .nullable(),
  works: z.array(workSchema),
  totals: z.object({ count: z.number().int(), credits: z.number().int(), downloaded: z.number().int() }),
})

export type EvidenceFacts = z.output<typeof evidenceFactsSchema>
export type EvidenceWork = EvidenceFacts['works'][number]
