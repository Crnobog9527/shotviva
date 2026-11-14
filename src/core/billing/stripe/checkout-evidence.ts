import type Stripe from 'stripe'

import type { CheckoutRoute } from './catalog'
import type { CheckoutClient } from './checkout'

// What a Checkout Session adds for dispute evidence and prevention (ARCHITECTURE §6.3, T82).

// Stripe metadata values hold at most 500 characters; a longer user agent is cut.
export const BUYER_META = { ip: 'buyer_ip', userAgent: 'buyer_ua' } as const

export function buyerMetadata(client: CheckoutClient): Record<string, string> {
  const meta: Record<string, string> = {}
  if (client.ip) meta[BUYER_META.ip] = client.ip
  if (client.userAgent) meta[BUYER_META.userAgent] = client.userAgent.slice(0, 500)
  return meta
}

type EvidenceParams = Pick<Stripe.Checkout.SessionCreateParams, 'consent_collection' | 'custom_text' | 'payment_method_options'>

const CONSENT_TEXT = {
  en: (terms: string, refunds: string) => `I agree to the [Terms of Service](${terms}) and the [Refund Policy](${refunds}).`,
  zh: (terms: string, refunds: string) => `我同意[服务条款](${terms})和[退款政策](${refunds})。`,
} as const

function consentParams(route: CheckoutRoute, input: { locale: 'en' | 'zh'; origin: string }): EvidenceParams {
  const consent: EvidenceParams = { consent_collection: { terms_of_service: 'required' } }
  // Managed Payments refuses custom_text (sandbox, 2026-11-08): its own box links the Terms URL
  // set in Stripe's public details.
  if (route.managedPayments) return consent
  // The legal pages use the same unprefixed URLs in both languages.
  const message = CONSENT_TEXT[input.locale](`${input.origin}/terms`, `${input.origin}/refund-policy`)
  return { ...consent, custom_text: { terms_of_service_acceptance: { message } } }
}

// 中国银行卡 always asks for 3D Secure (Owner 2026-11-08): an authenticated fraud dispute shifts
// liability to the issuer. Accepted by Checkout in payment and subscription mode (sandbox).
const THREE_D_SECURE: EvidenceParams = { payment_method_options: { card: { request_three_d_secure: 'any' } } }

export function evidenceParams(
  route: CheckoutRoute,
  method: string,
  input: { locale: 'en' | 'zh'; origin: string; termsConsent: boolean },
): EvidenceParams {
  return {
    ...(input.termsConsent ? consentParams(route, input) : {}),
    ...(method === 'cn_card' ? THREE_D_SECURE : {}),
  }
}
