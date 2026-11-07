import { activityLog, FIELD_LIMIT, ipMatches, utc } from './activity-log'
import type { EvidenceFacts } from './facts'

// The Stripe evidence draft (ARCHITECTURE §6.3 「拒付申诉证据」, T82), written in English for
// the issuing bank. Text fields only: files are added by the Owner on the admin page. Stripe has
// no terms_of_service field; the Terms acceptance goes into the activity log and the refund
// disclosure. Each field stays under Stripe's 20,000 characters (150,000 in all).

export type EvidenceProduct = { name: string; credits: number; membership: 'month' | 'year' | null }

export type EvidenceContext = {
  brand: string
  // https://shotviva.com, for the policy links.
  origin: string
  product: EvidenceProduct | null
  refundPolicyText: string
  termsUrl: string
  refundUrl: string
  // From the Stripe charge's billing details: phone accounts have no email of their own.
  charge: { email: string | null; name: string | null }
}

export type EvidenceText = Partial<
  Record<
    | 'access_activity_log'
    | 'cancellation_policy_disclosure'
    | 'customer_email_address'
    | 'customer_name'
    | 'customer_purchase_ip'
    | 'product_description'
    | 'refund_policy_disclosure'
    | 'refund_refusal_explanation'
    | 'service_date'
    | 'uncategorized_text',
    string
  >
>

const cap = (text: string) => (text.length <= FIELD_LIMIT ? text : `${text.slice(0, FIELD_LIMIT - 1)}…`)

function productDescription(ctx: EvidenceContext): string {
  const what = ctx.product
    ? `The customer bought "${ctx.product.name}": ${ctx.product.credits} credits${ctx.product.membership ? `, a ${ctx.product.membership}ly membership that renews until cancelled` : ', a one-time credit pack'}.`
    : 'The customer bought credits.'
  return [
    `${ctx.brand} (${ctx.origin}) is an online AI photo studio: customers upload their own photos and create new images from templates. It is a digital service; nothing is shipped.`,
    what,
    'Credits are added to the customer’s account the moment the payment succeeds. Each image costs a fixed number of credits, shown before it is created; finished images appear on the website at once and can be downloaded.',
  ].join(' ')
}

function refundDisclosure(facts: EvidenceFacts, ctx: EvidenceContext): string {
  const accepted = facts.payment?.terms_accepted_at
  const consent = accepted
    ? `At checkout the customer had to tick a box agreeing to the Terms of Service (${ctx.termsUrl}) and the Refund Policy (${ctx.refundUrl}) before paying; they did so at ${utc(accepted)}.`
    : `The Refund Policy (${ctx.refundUrl}) and Terms of Service (${ctx.termsUrl}) are linked from every page and from the purchase screen.`
  return cap(`${consent}\n\nThe policy in full:\n\n${ctx.refundPolicyText}`)
}

function refusal(facts: EvidenceFacts): string | undefined {
  if (!facts.payment || facts.totals.count === 0) return undefined
  return `Our policy refunds a purchase only within 7 days and only when none of its credits were used. After this payment the customer used ${facts.totals.credits} credits to create ${facts.totals.count} images (see the activity log), so the purchase was used as described and is not refundable under the policy they agreed to.`
}

function sameIp(facts: EvidenceFacts): string {
  const purchaseIp = facts.payment?.purchase_ip
  const { matching, known } = ipMatches(facts)
  if (known === 0 || !purchaseIp) return ''
  return ` ${matching} of the ${known} images with a recorded IP were created from the same IP address as the checkout (${purchaseIp}).`
}

function span(facts: EvidenceFacts): string {
  const first = facts.works[0]
  const last = facts.works.at(-1)
  return first && last ? ` between ${utc(first.created_at)} and ${utc(last.created_at)}` : ''
}

function summary(facts: EvidenceFacts, ctx: EvidenceContext): string {
  const pay = facts.payment
  if (!pay) return `This charge (${facts.dispute.charge_id}) was made on ${ctx.brand}. The account's own records are attached in the activity log.`
  return [
    `The cardholder paid for ${ctx.product?.name ?? pay.product_id} on ${utc(pay.created_at)} while signed in to their ${ctx.brand} account, and the credits were delivered to that account immediately.`,
    facts.totals.count > 0
      ? `The same account then used ${facts.totals.credits} credits to create ${facts.totals.count} images${span(facts)}, and downloaded ${facts.totals.downloaded} of them.${sameIp(facts)}`
      : 'The account has not used the credits from this payment yet.',
    facts.user?.banned_at ? 'The account was suspended when the dispute arrived.' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildEvidence(facts: EvidenceFacts, ctx: EvidenceContext): EvidenceText {
  const pay = facts.payment
  const evidence: EvidenceText = {
    access_activity_log: activityLog(facts),
    product_description: cap(productDescription(ctx)),
    refund_policy_disclosure: refundDisclosure(facts, ctx),
    uncategorized_text: cap(summary(facts, ctx)),
    refund_refusal_explanation: refusal(facts),
    customer_email_address: facts.user?.email ?? ctx.charge.email ?? undefined,
    customer_name: ctx.charge.name ?? undefined,
    customer_purchase_ip: pay?.purchase_ip ?? undefined,
    service_date: pay ? pay.created_at.toISOString().slice(0, 10) : undefined,
    cancellation_policy_disclosure: ctx.product?.membership
      ? `Members can cancel at any time from their account page ("Manage subscription"); the plan then stops renewing at the end of the paid period. See the Terms of Service: ${ctx.termsUrl}`
      : undefined,
  }
  return Object.fromEntries(Object.entries(evidence).filter(([, value]) => value !== undefined && value !== '')) as EvidenceText
}
