import { freeImagesLabel } from '@/core/config'
import type { FaqItem } from '@/core/content'

import { site } from '../site.config'

// Placeholder for /pricing. Paywall and checkout arrive with T9; prices come from site.config.
export const pricingPage = {
  path: '/pricing',
  title: `Pricing: ${freeImagesLabel(site)}, then one-time packs | ${site.brand.name}`,
  description: `${site.brand.name} pricing. Start with ${freeImagesLabel(site)}, then buy a one-time pass or pack. No subscription.`,
  h1: `${site.brand.name} pricing`,
  intro: `Every account starts with ${freeImagesLabel(site)}. One image uses 1 credit, and credits never expire.`,
  faq: [
    { question: 'Is this a subscription?', answer: 'No. Every purchase is a one-time payment.' },
    { question: 'Do credits expire?', answer: 'No. Unused images stay on your account.' },
    {
      question: 'Can I try before I pay?',
      answer: `Yes. New accounts get ${freeImagesLabel(site)}.`,
    },
  ] satisfies FaqItem[],
} as const
