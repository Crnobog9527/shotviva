import type { Balance } from '@/core/billing/pools'

import { ctaState, type CtaState } from '../workspace/cta-state'

// What the home generator knows about the visitor (from the server, ARCHITECTURE §13 item 2).
// null: signed out.
export type HomeViewer = {
  balance: Balance
  // TIER_LIMITS concurrency, and the jobs running when the page was rendered.
  concurrency: { limit: number; runningIds: string[] }
  // Saved template ids, newest first (T83), read with the visitor's own session.
  favoriteIds: string[]
}

export type HomePhotoStatus = 'none' | 'uploading' | 'ready' | 'error'

// The generator's one primary (DESIGN §6.9 item 9). Signed in it is the workspace's own rule
// (cta-state.ts): Get credits · N needed → wait → photo → Generate. Signed out it never
// charges: no photo asks for one, a photo opens the sign-up prompt.
export type HomeCta =
  | { kind: 'no-template' }
  | { kind: 'sign-up'; cost: number }
  | { kind: 'pick-photo'; cost: number }
  | { kind: 'needs-copy' }
  | CtaState

type Input = {
  viewer: HomeViewer | null
  // Credits for one Standard photo of the chosen template; null when no template is live.
  cost: number | null
  photo: HomePhotoStatus
  photoOptional?: boolean
  running: number
  // The template asks for text (a headline, a price) the bar has no field for.
  needsCopy: boolean
}

export function homeCta({ viewer, cost, photo: status, photoOptional, running, needsCopy }: Input): HomeCta {
  const photo = status === 'none' && photoOptional ? 'ready' : status
  if (cost === null) return { kind: 'no-template' }
  if (!viewer) return photo === 'none' || photo === 'error' ? { kind: 'pick-photo', cost } : { kind: 'sign-up', cost }
  if (needsCopy) return { kind: 'needs-copy' }
  const state = ctaState({
    balance: viewer.balance,
    cost,
    running,
    limit: viewer.concurrency.limit,
    photo: photo === 'error' ? 'none' : photo,
  })
  return state.kind === 'need-photo' ? { kind: 'pick-photo', cost } : state
}
