import { z } from 'zod'

import { currentPeriod } from './hogql'
import { rowsOf, type HogQL, type RunQuery } from './posthog-query'
import type { Window } from './range'
import { count } from './values'

// 「模板分享」 (Owner 2026-11-13): template share links, from the press of 分享 to the first photo a
// shared template brought. People (PostHog persons), except shares and opens, which also count
// presses and page loads. A sign-up counts when its signup event carries the share mark.

export const SHARE_STEPS = ['shares', 'opens', 'signedOutOpens', 'signupStarts', 'signups', 'firstPhotos'] as const
export type ShareStep = (typeof SHARE_STEPS)[number]
export type ShareFunnel = Record<ShareStep, number> & { sharePresses: number; openLoads: number }

export function shareFunnelQuery(window: Window): HogQL {
  return {
    name: 'shares.funnel',
    query: `
SELECT countIf(event = 'template_share') AS share_presses,
  uniqIf(person_id, event = 'template_share') AS shares,
  countIf(event = 'template_share_open') AS open_loads,
  uniqIf(person_id, event = 'template_share_open') AS opens,
  uniqIf(person_id, event = 'template_share_open' AND toString(properties.signed_in) IN ('false', '0')) AS signed_out_opens,
  uniqIf(person_id, event = 'template_share_signup_start') AS signup_starts,
  uniqIf(person_id, event = 'signup' AND toString(properties.share_template_id) != '') AS signups,
  uniqIf(person_id, event = 'template_share_generate') AS first_photos
FROM events
WHERE event IN ('template_share', 'template_share_open', 'template_share_signup_start', 'signup', 'template_share_generate') AND ${currentPeriod(window)}`,
  }
}

const row = z.object({
  share_presses: count, shares: count, open_loads: count, opens: count, signed_out_opens: count,
  signup_starts: count, signups: count, first_photos: count,
})

export function shapeShares(rows: z.infer<typeof row>[]): ShareFunnel {
  const r = rows[0] ?? { share_presses: 0, shares: 0, open_loads: 0, opens: 0, signed_out_opens: 0, signup_starts: 0, signups: 0, first_photos: 0 }
  return {
    sharePresses: r.share_presses, shares: r.shares, openLoads: r.open_loads, opens: r.opens,
    signedOutOpens: r.signed_out_opens, signupStarts: r.signup_starts, signups: r.signups, firstPhotos: r.first_photos,
  }
}

export async function loadShares(run: RunQuery, window: Window): Promise<ShareFunnel> {
  return shapeShares(rowsOf(await run(shareFunnelQuery(window)), row))
}
