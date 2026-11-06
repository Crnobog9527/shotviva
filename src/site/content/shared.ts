import type { Fact } from '@/core/content'

import {
  FromCredits,
  freeImagesLabel,
  languages,
  packFrom,
  planFrom,
  tierPixels,
  uploadLimits,
  usd,
} from './offer'

// Facts shared by every page, so one number never has two versions
// (建站规格 G3, G4). Numbers come from offer.ts, which reads site.config.

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
