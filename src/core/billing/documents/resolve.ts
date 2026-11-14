import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { z } from 'zod'

import { AppError } from '../../errors'
import { logger } from '../../logger'
import type { StripeApi } from '../stripe/client'
import { INVOICE_EXPAND, invoiceChargeId } from '../stripe/payment-facts'
import { PAYMENT_DOCUMENTS, type PaymentDocument } from './lines'

// The provider's receipt or invoice for one payments row, asked of Stripe when the buyer clicks
// (ARCHITECTURE §6.3, T80). Never stored: Stripe's receipt links stop working after 30 days, so
// a fresh one is read every time. Someone else's row, or a made-up id, reads as not found.
// null = the provider has nothing to open (Waffo, or Stripe could not answer just now).

export type DocumentDeps = {
  db: SupabaseClient
  // Lazy, so a Waffo row never needs the Stripe key.
  stripe: () => StripeApi
}

export type DocumentRequest = { userId: string; paymentId: string; document: string }

const rowSchema = z.object({
  channel: z.enum(['stripe', 'waffo']),
  stripe_session_id: z.string().nullable(),
  stripe_invoice_id: z.string().nullable(),
  stripe_charge_id: z.string().nullable(),
})
type Row = z.infer<typeof rowSchema>

const notFound = () => new AppError('NOT_FOUND', 'Not found')

export async function resolvePaymentDocument(deps: DocumentDeps, request: DocumentRequest): Promise<string | null> {
  const document = z.enum(PAYMENT_DOCUMENTS).safeParse(request.document)
  if (!document.success || !/^[1-9]\d{0,17}$/.test(request.paymentId)) throw notFound()
  const row = await readRow(deps.db, request.userId, request.paymentId)
  if (row.channel !== 'stripe') return null
  try {
    const url = await stripeDocument(deps.stripe(), row, document.data)
    return url && isStripeUrl(url) ? url : null
  } catch (error) {
    logger.warn('payment document not readable', { payment_id: request.paymentId, document: document.data, error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

// payments_pkey, filtered to the signed-in user (service role; the table has no client policy).
async function readRow(db: SupabaseClient, userId: string, paymentId: string): Promise<Row> {
  const { data, error } = await db
    .from('payments')
    .select('channel, stripe_session_id, stripe_invoice_id, stripe_charge_id')
    .eq('id', paymentId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', `payment document: payments read failed: ${error.message}`)
  if (!data) throw notFound()
  return rowSchema.parse(data)
}

function stripeDocument(stripe: StripeApi, row: Row, document: PaymentDocument): Promise<string | null> {
  return document === 'receipt' ? receiptUrl(stripe, row) : invoiceUrl(stripe, row)
}

// The charge's hosted receipt (it shows refunds too). Rows settled before Stripe had the charge
// have no charge id; it is then found from the invoice or the session's PaymentIntent.
async function receiptUrl(stripe: StripeApi, row: Row): Promise<string | null> {
  const chargeId = row.stripe_charge_id ?? (await chargeIdOf(stripe, row))
  if (!chargeId) return null
  const charge = await stripe.charges.retrieve(chargeId)
  return charge.receipt_url ?? null
}

async function chargeIdOf(stripe: StripeApi, row: Row): Promise<string | null> {
  if (row.stripe_invoice_id) {
    return invoiceChargeId(await stripe.invoices.retrieve(row.stripe_invoice_id, { expand: INVOICE_EXPAND }))
  }
  if (!row.stripe_session_id) return null
  const session = await stripe.checkout.sessions.retrieve(row.stripe_session_id, { expand: ['payment_intent'] })
  const intent = session.payment_intent
  return intent && typeof intent === 'object' ? idOf(intent.latest_charge) : null
}

// The invoice PDF to download; its hosted page when the PDF is not ready.
async function invoiceUrl(stripe: StripeApi, row: Row): Promise<string | null> {
  if (!row.stripe_invoice_id) return null
  const invoice: Stripe.Invoice = await stripe.invoices.retrieve(row.stripe_invoice_id)
  return invoice.invoice_pdf ?? invoice.hosted_invoice_url ?? null
}

const idOf = (value: string | { id: string } | null | undefined): string | null => (typeof value === 'string' ? value : (value?.id ?? null))

// We only ever send the buyer on to Stripe's own pages (pay.stripe.com, invoice.stripe.com).
export function isStripeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && (parsed.hostname === 'stripe.com' || parsed.hostname.endsWith('.stripe.com'))
  } catch {
    return false
  }
}
