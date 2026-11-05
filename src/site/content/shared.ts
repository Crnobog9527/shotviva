import { formatProductPrice, freeImagesLabel } from '@/core/config'
import type { CostTable, Fact, HeroBlock } from '@/core/content'

import { site } from '../site.config'

// Placeholder copy (final wording is T11). Every number is read from site.config (建站规格 G3).
const LANGUAGE_NAMES: Record<string, string> = { en: 'English' }

export const PENDING = 'To be confirmed'

export function paidOptionsLabel(): string {
  return site.billing.products
    .map((p) => `${p.id}: ${p.credits} images, ${p.paidDays} days, ${formatProductPrice(p)}`)
    .join('; ')
}

export function sharedFacts(): readonly [Fact, Fact, Fact, Fact] {
  return [
    { label: 'Free to start', value: freeImagesLabel(site) },
    { label: 'Paid options (one-time, no subscription)', value: paidOptionsLabel() },
    {
      label: 'Supported languages',
      value: site.locales.enabled.map((code) => LANGUAGE_NAMES[code] ?? code).join(', '),
    },
    { label: 'DoorDash / Uber Eats / Grubhub photo sizes', value: PENDING },
  ]
}

export function sharedCostTable(): CostTable {
  const pass = site.billing.products.find((p) => p.id === 'pass')
  return {
    caption: `Hiring a photographer vs ${site.brand.name}`,
    headers: { item: 'What you pay for', photographer: 'Photographer', site: site.brand.name },
    rows: [
      { item: 'Free trial', photographer: 'None', site: freeImagesLabel(site) },
      {
        item: 'One menu of dish photos',
        photographer: PENDING,
        site: pass ? formatProductPrice(pass) : PENDING,
      },
      { item: 'Turnaround', photographer: PENDING, site: PENDING },
    ],
  }
}

export function placeholderHero(caption: string): HeroBlock {
  return {
    before: {
      src: '/placeholders/dish-before.svg',
      alt: 'Phone photo of a grilled salmon dish on a ceramic plate, dim restaurant lighting',
      width: 600,
      height: 600,
    },
    after: {
      src: '/placeholders/dish-after.svg',
      alt: 'AI food photo of the same grilled salmon on a ceramic plate, studio lighting',
      width: 600,
      height: 600,
    },
    caption,
    cta: { label: 'Upload a photo', href: '/generate' },
  }
}
