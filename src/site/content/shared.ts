import type { CostTable, Fact, HeroBlock } from '@/core/content'

import { site } from '../site.config'
import {
  FromCredits,
  freeImagesLabel,
  languages,
  packFrom,
  photographerRate,
  planFrom,
  setCredits,
  tierPixels,
  uploadLimits,
  usd,
} from './offer'

// Facts and the cost table shared by every page, so one number never has two versions
// (建站规格 G3, G4). Numbers come from offer.ts, which reads site.config.

const brand = site.brand.name

function paidValue(): string {
  if (!planFrom) return 'Plans and credit packs: prices coming soon'
  const packs = packFrom ? `; credit packs from ${usd(packFrom.priceUsd)}, one-time` : ''
  return `Plans from ${usd(planFrom.priceUsd)} a month${packs}`
}

export function sharedFacts(): readonly [Fact, Fact, Fact, ...Fact[]] {
  return [
    {
      label: 'What stays the same',
      value: 'The subject you shot: its shape, colors, label, plating or room layout',
    },
    { label: 'What the template changes', value: 'The light, the background, the scene or the art style' },
    { label: 'Free to start', value: `${freeImagesLabel} when you sign up, given once` },
    { label: 'Cost per photo', value: `${FromCredits} (Standard)` },
    { label: 'Output sizes', value: tierPixels },
    { label: 'Uploads', value: uploadLimits },
    { label: 'Prices', value: paidValue() },
    { label: 'Free vs paid photos', value: 'Free photos are public with a watermark; paid photos are private and watermark-free' },
    { label: 'Prompts', value: 'None to write: you pick a template' },
    { label: 'Languages', value: languages },
  ]
}

export function sharedCostTable(): CostTable {
  const plans = planFrom ? `, plans from ${usd(planFrom.priceUsd)} a month` : ''
  return {
    caption: `Hiring a photographer vs shooting it yourself vs ${brand}`,
    headers: { item: 'What you compare', photographer: 'Hire a photographer', diy: 'Shoot it yourself', site: brand },
    rows: [
      {
        item: 'Price',
        photographer: `${photographerRate} in a US city, plus booking fees`,
        diy: 'Your time, plus lights, a backdrop and props',
        site: `${FromCredits} a photo${plans}`,
      },
      { item: 'Free to try', photographer: 'No', diy: 'Only if you already own the gear', site: freeImagesLabel },
      {
        item: 'One product, three looks',
        photographer: 'Three setups during a booked shoot',
        diy: 'Three setups, then editing',
        site: `One phone photo, three templates, from ${setCredits} credits`,
      },
      {
        item: 'When you get the photos',
        photographer: 'After the shoot and the editing',
        diy: 'After setup and editing',
        site: 'In the same visit',
      },
    ],
  }
}

// Placeholder pair until T8 ships the real "one phone photo → full set" demo images.
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
