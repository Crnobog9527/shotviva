import type { Fact, RelatedLink } from '@/core/content'

import { site } from '../site.config'

import {
  freeImagesLabel,
  FreeImagesLabel,
  languages,
  type OfferFacts,
  tierPixels,
  uploadLimits,
  usd,
} from './offer'

// Facts shared by every page, so one number never has two versions
// (建站规格 G3, G4). Numbers come from offer.ts, which reads site.config.

function paidValue({ planFrom, packFrom }: OfferFacts): string {
  if (!planFrom) return packFrom ? `One-time credit packs from ${usd(packFrom.priceUsd)}` : 'Plans and credit packs: prices coming soon'
  const packs = packFrom ? `; credit packs from ${usd(packFrom.priceUsd)}, one-time` : ''
  return `Plans from ${usd(planFrom.priceUsd)} a month${packs}`
}

export function sharedFacts(offers: OfferFacts): readonly [Fact, Fact, Fact, ...Fact[]] {
  return [
    // Why choose Shotviva (Owner 2026-11-08): the two key rows first, then the comparison,
    // who and where, then the numbers every page shares.
    {
      label: 'Your photo stays your photo',
      value: 'The product, its label, the food and the room stay as you shot them. The light, background or scene changes; food templates may also swap the plate or bowl.',
    },
    {
      label: 'Edit like Photoshop, in plain words',
      value: 'Say "remove the clutter" or "make it a sunny day". Only that part changes, and it still holds after many rounds of edits.',
    },
    {
      label: 'What other AI tools often do',
      value: 'Redraw the whole picture: a misspelled label, a dish that isn’t yours, new furniture in your room. Each extra edit drifts further from the real thing.',
    },
    {
      label: 'Why your photo holds up here',
      value: `Our own editing engine, built in-house, runs on the world’s top image models. Before every change it works out exactly what you asked for and locks everything else in place.`,
    },
    {
      label: 'Who it is for',
      value: 'Restaurants and cafés, online sellers, hosts and real-estate agents, small brands, and anyone whose photos have to match what customers actually get',
    },
    {
      label: 'Where you use it',
      value: 'Menus and delivery apps, marketplace listings, rental and room photos, social posts and ads, or fixing a photo you already like',
    },
    { label: 'What you don’t need', value: 'A studio, a designer or a prompt. Pick a template, or type one line about what to change.' },
    { label: 'Free to start', value: `${FreeImagesLabel} when you sign up, given once` },
    { label: 'Output sizes', value: tierPixels },
    { label: 'Uploads', value: uploadLimits },
    { label: 'Prices', value: paidValue(offers) },
    { label: 'Free vs paid photos', value: 'Free photos are public with a watermark; paid photos are private and watermark-free' },
    { label: 'Languages', value: languages },
  ]
}

// The Pricing card that closes a landing page's "More From Shotviva" (gap audit B10,
// design/comps-v3-b/landing.html): the cheapest plan and the signup gift, from offer.ts.
export function pricingRelated({ planFrom }: OfferFacts): RelatedLink {
  const note = planFrom ? `Plans from ${usd(planFrom.priceUsd)} a month, ${freeImagesLabel} to start.` : 'Plans and one-time credit packs.'
  return { href: '/pricing', anchor: `${site.brand.name} pricing`, note }
}
