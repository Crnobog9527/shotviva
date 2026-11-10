import type { WallCard } from '../types'

export const GUIDE_STEPS = ['say', 'vote', 'ship'] as const
export type GuideStep = (typeof GUIDE_STEPS)[number]

// The one example wish the teaching sheet shows (Owner 2026-11-11): the light bubble-tea poster
// from the landing page's Wishlist, with 51 votes before the user's own.
const PHOTO = '/home/wish-tea-light.webp'
const VOTES = 51
// A fixed "when", so the byline reads "3 days ago" on the server and in the browser alike.
const CREATED_AT = '2026-11-01T09:00:00.000Z'
export const DEMO_NOW = new Date('2026-11-04T09:00:00.000Z')

export type DemoCopy = { description: string; author: string; template: string }

// The wall card's data at each step: live and waiting for a vote, live with the vote in, then
// shipped as a template. Rendered by the wall's own WallCard, so the sheet shows what the wall
// will show.
export function demoCard(step: GuideStep, voted: boolean, copy: DemoCopy): WallCard {
  const shipped = step === 'ship'
  const counted = voted || shipped
  return {
    id: 'guide-demo',
    description: copy.description,
    authorLabel: copy.author,
    status: shipped ? 'shipped' : 'live',
    votesCount: counted ? VOTES + 1 : VOTES,
    voted: counted,
    template: shipped ? { id: 'guide-demo', name: copy.template } : null,
    imageUrls: [PHOTO],
    createdAt: CREATED_AT,
  }
}
