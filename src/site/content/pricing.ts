import type { PaymentChannel } from '@/core/config'
import type { CreditBuysBlock, FaqItem } from '@/core/content'
import type { BusinessBlock } from '@/core/content/business'

import { site } from '../site.config'
import { businessForm } from './business-form'
import { freeImagesLabel, fromCredits, packFrom, perHundredCredits, planFrom, tierList, usd, yearlySaving } from './offer'

// Final /pricing copy (T11, laid out as comps-v3-b pricing.html in T37). Every number is read
// from site.config through offer.ts; the plan and pack cards themselves render from the
// products in core/billing/paywall.
const brand = site.brand.name

// One shape for /pricing in every language (zh/pricing.ts is the Chinese one).
export type PricingContent = {
  path: '/pricing'
  label: string
  title: string
  description: string
  // The whole H1 (the keyword first, 建站规格 R3); `h1Em` is its italic tail, empty in Chinese
  // (DESIGN §3.2: no italics in Chinese).
  h1: string
  h1Em: string
  intro: string
  gift: string
  creditBuys: CreditBuysBlock
  business: BusinessBlock
  headings: { faq: string }
  faq: readonly FaqItem[]
  // The FAQ when the paywall runs on Waffo (PAYMENT_CHANNEL=waffo, ARCHITECTURE §6.3): the same,
  // except where a card plan is cancelled.
  waffo: { faq: readonly FaqItem[] }
}

const creditBuys: CreditBuysBlock = {
  heading: 'How many credits does a photo use?',
  note: 'The cost depends on the template and resolution you choose. The Generate button shows the exact number of credits before you start.',
}

// Things we arrange on request, not features: none of them has a back office or code yet
// (Owner 2026-11-06), so nothing here promises an SLA, SSO or team seats.
const business: BusinessBlock = {
  heading: 'For business',
  tag: 'Made to order',
  who: 'For brands, e-commerce sellers, restaurant groups and agencies that need photos at volume. Tell us what you need and we set it up for you:',
  items: [
    { title: 'Volume pricing and invoicing', detail: 'Annual contracts, priced for your volume and billed by invoice.' },
    { title: 'Custom templates', detail: 'Built to your brand guide, product line and marketplace specs: one consistent look across the catalog.' },
    { title: 'Higher throughput, bigger batches', detail: 'Whole catalogs at once, not one photo at a time.' },
    { title: 'API access', detail: `${brand} inside your product system or store.` },
    { title: 'Privacy and data terms', detail: 'Your work stays private; a DPA on request.' },
    { title: 'A dedicated contact', detail: 'One person for onboarding and priority help.' },
  ],
  cta: 'Contact us',
  form: businessForm,
}

const titlePrice = planFrom ? `Plans From ${usd(planFrom.priceUsd)} a Month` : 'Plans and Credit Packs'
const yearly = yearlySaving ? ` Yearly plans save up to ${yearlySaving}%.` : ''
const packs = packFrom ? ` Credit packs start at ${usd(packFrom.priceUsd)}.` : ''

const faq: readonly FaqItem[] = [
  {
    question: 'Do credits expire?',
    answer: 'No. Paid credits never expire. An annual plan includes twelve months of base credits. Unused credits stay on your account.',
  },
  {
    question: 'What do the free images include?',
    answer: `New users get ${freeImagesLabel}, once. Photos made with free credits are public and carry a watermark. Photos made with paid credits are private, have no watermark and can be used commercially.`,
  },
  {
    question: 'Can I buy credits without a subscription?',
    answer: site.billing.pricingVersion ? `Yes. Credit packs are one-time payments, open to everyone, and they give paid credits just like a plan. At list price, 100 credits cost about ${perHundredCredits('pack_s')}. The small pack is full price. On medium and large packs, active Starter members save 5%, Pro members 10%, and Max members 15%. The pack contains the same credits at every tier.`
      : 'Yes. Credit packs are one-time payments, open to everyone, and they give paid credits just like a plan.',
  },
  {
    question: 'How do I cancel my plan?',
    answer: 'Open your account page and choose Manage subscription. Your plan ends at the end of the period you paid for, and your credits stay on your account.',
  },
]

// On Waffo a card plan is cancelled from the account page with our own button (T50), not a
// Stripe portal; everything else reads the same (ARCHITECTURE §6.3).
const CANCEL_QUESTION = 'How do I cancel my plan?'
const waffoFaq = faq.map((item) =>
  item.question === CANCEL_QUESTION
    ? { ...item, answer: 'Open your account page and choose Cancel subscription. Your plan ends at the end of the period you paid for, and your credits stay on your account.' }
    : item,
)

export const pricingPage: PricingContent = {
  path: '/pricing',
  label: 'Pricing',
  title: `${brand} Pricing: ${titlePrice}`,
  description: `${brand} pricing: Starter, Pro and Max plans, monthly or yearly, plus credit packs. New users get ${freeImagesLabel}. Credits never expire.`,
  h1: `${brand} Pricing: pay monthly, pay yearly, or buy credits once`,
  h1Em: 'or buy credits once',
  intro: `Every photo made with paid credits is private and watermark-free. A photo costs ${fromCredits}, depending on the template and whether you pick ${tierList}.${yearly}${packs}`,
  gift: `New users get ${freeImagesLabel}. No card needed.`,
  creditBuys,
  business,
  headings: { faq: 'Pricing FAQ' },
  faq,
  waffo: { faq: waffoFaq },
}

// The /pricing FAQ for the live channel, in English (localized.ts has every language).
export function pricingFaq(channel: PaymentChannel): readonly FaqItem[] {
  return channel === 'waffo' ? pricingPage.waffo.faq : pricingPage.faq
}
