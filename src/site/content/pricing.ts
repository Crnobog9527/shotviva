import type { PaymentChannel } from '@/core/config'
import type { FaqItem } from '@/core/content'

import { site } from '../site.config'
import {
  OUTPUT_TIERS,
  PACKS,
  PLAN_TIERS,
  creditsOf,
  freeImagesLabel,
  packFrom,
  perCredit,
  planFrom,
  priceOf,
  usd,
  yearlySaving,
} from './offer'

// Final /pricing copy (T11). Every number is read from site.config through offer.ts; until
// T9 adds the nine products the cells show PRICE_PENDING. Checkout is T9.
const brand = site.brand.name

type Table = { caption: string; headers: readonly string[]; rows: readonly (readonly string[])[] }

// One shape for /pricing in every language (zh/pricing.ts is the Chinese one).
export type PricingContent = {
  path: '/pricing'
  label: string
  title: string
  description: string
  h1: string
  intro: string
  tables: { plans: Table; packs: Table; photoCost: Table }
  headings: { payment: string; faq: string }
  payment: readonly string[]
  faq: readonly FaqItem[]
  // The same blocks when the paywall runs on Waffo (PAYMENT_CHANNEL=waffo, ARCHITECTURE §6.3):
  // every purchase is one-time, so nothing about renewing or cancelling.
  oneTime: { payment: readonly string[]; faq: readonly FaqItem[] }
}

const plansTable: Table = {
  caption: 'Monthly and yearly plans',
  headers: ['Plan', 'Monthly', 'Credits a month', 'Yearly', 'Credits a year, upfront', 'Per credit, yearly'],
  rows: PLAN_TIERS.map((tier) => [
    tier.name,
    priceOf(tier.monthly),
    creditsOf(tier.monthly),
    priceOf(tier.yearly),
    creditsOf(tier.yearly),
    perCredit(tier.yearly),
  ]),
}

const packsTable: Table = {
  caption: 'One-time credit packs, for anyone',
  headers: ['Pack', 'Price', 'Credits', 'Per credit'],
  rows: PACKS.map((pack) => [pack.name, priceOf(pack.id), creditsOf(pack.id), perCredit(pack.id)]),
}

const photoCostTable: Table = {
  caption: 'What one photo costs on most templates',
  headers: ['Size', 'Pixels', 'Good for', 'Credits'],
  rows: OUTPUT_TIERS.map((tier) => [tier.name, `${tier.px} px`, tier.use, String(tier.credits)]),
}

const titlePrice = planFrom ? `Plans From ${usd(planFrom.priceUsd)} a Month` : 'Plans and Credit Packs'
const yearly = yearlySaving ? ` Yearly plans save up to ${yearlySaving}%.` : ''
const packs = packFrom ? ` Credit packs start at ${usd(packFrom.priceUsd)}.` : ''

const faq: readonly FaqItem[] = [
  {
    question: 'Do credits expire?',
    answer: 'No. Paid credits never expire, and credits you do not use roll over when your plan renews.',
  },
  {
    question: 'What do the free images include?',
    answer: `New users get ${freeImagesLabel}, once. Photos made with free credits are public and carry a watermark. Photos made with paid credits are private, have no watermark and can be used commercially.`,
  },
  {
    question: 'Can I buy credits without a subscription?',
    answer: 'Yes. Credit packs are one-time payments, open to everyone, and they give paid credits just like a plan.',
  },
  {
    question: 'How do I cancel my plan?',
    answer: 'Open your account page and choose Manage subscription. Your plan ends at the end of the period you paid for, and your credits stay on your account.',
  },
]

// When the paywall runs on Waffo every purchase is one-time: no cancel question, and unused
// credits simply stay (ARCHITECTURE §6.3).
const CANCEL_QUESTION = 'How do I cancel my plan?'
const oneTimeFaq = faq
  .filter((item) => item.question !== CANCEL_QUESTION)
  .map((item) =>
    item.question === 'Do credits expire?'
      ? { ...item, answer: 'No. Paid credits never expire, and credits you do not use stay on your account.' }
      : item,
  )

export const pricingPage: PricingContent = {
  path: '/pricing',
  label: 'Pricing',
  title: `${brand} Pricing: ${titlePrice}`,
  description: `${brand} pricing: Starter, Pro and Max plans, monthly or yearly, plus one-time credit packs. New users get ${freeImagesLabel}. Credits never expire.`,
  h1: `${brand} Pricing`,
  intro: `Every new account gets ${freeImagesLabel}. After that you pay in credits: a photo costs a few credits, depending on the template and the size you pick. Choose a plan, or buy a pack when you only need a few photos.${yearly}${packs}`,
  tables: { plans: plansTable, packs: packsTable, photoCost: photoCostTable },
  headings: { payment: 'How you pay', faq: 'Pricing FAQ' },
  payment: [
    'Card, Apple Pay or Google Pay: plans renew automatically, and you can cancel any time. Cancelling stops the next renewal; your credits stay.',
    'Alipay: a one-time payment for one month or one year of a plan, with no auto-renewal.',
    'Credit packs are always a one-time payment and can be bought without a plan.',
  ],
  faq,
  oneTime: {
    payment: [
      'Card or Alipay: a one-time payment for one month or one year of a plan. When it ends, buy again if you want more.',
      'Credit packs are always a one-time payment and can be bought without a plan.',
    ],
    faq: oneTimeFaq,
  },
}

// The /pricing payment lines and FAQ for the live channel, in English (localized.ts has every
// language).
export function pricingPayment(channel: PaymentChannel): readonly string[] {
  return channel === 'waffo' ? pricingPage.oneTime.payment : pricingPage.payment
}

export function pricingFaq(channel: PaymentChannel): readonly FaqItem[] {
  return channel === 'waffo' ? pricingPage.oneTime.faq : pricingPage.faq
}

export type PricingTable = Table
