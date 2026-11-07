import { z } from 'zod'

import { at, bothPeriods, periodColumn } from './hogql'
import { rowsOf, type HogQL, type RunQuery } from './posthog-query'
import type { Window } from './range'
import { count, flag, maybe, rate } from './values'

// Block 4 「新用户激活」 (ARCHITECTURE §16.2a), for the people who signed up in each period: the
// share who got a first image within 24 hours, the average time from sign-up to the first image
// and to the first payment (followed up to now), and, of those who used up the free credits,
// the share who paid. "Used up" = succeeded free-pool images whose credits add up to the sign-up
// gift (failed images are refunded, so they do not count).

export function activationQuery(window: Window, giftCredits: number): HogQL {
  const gift = Math.max(1, Math.floor(giftCredits))
  return {
    name: 'activation',
    query: `
SELECT ${periodColumn(window, 'signed_at')} AS cur, count() AS signups,
  countIf(has_image AND dateDiff('second', signed_at, first_image) <= 86400) AS active_24h,
  avgIf(dateDiff('second', signed_at, first_image), has_image AND first_image >= signed_at) AS seconds_to_image,
  avgIf(dateDiff('second', signed_at, first_paid), has_paid AND first_paid >= signed_at) AS seconds_to_paid,
  countIf(free_credits >= ${gift}) AS used_gift,
  countIf(free_credits >= ${gift} AND has_paid) AS paid_after_gift
FROM (
  SELECT person_id,
    minIf(timestamp, event = 'signup') AS signed_at,
    countIf(event = 'generate' AND properties.status = 'succeeded') > 0 AS has_image,
    minIf(timestamp, event = 'generate' AND properties.status = 'succeeded') AS first_image,
    countIf(event = 'purchase') > 0 AS has_paid,
    minIf(timestamp, event = 'purchase') AS first_paid,
    sumIf(toFloat(properties.credits_cost), event = 'generate' AND properties.status = 'succeeded' AND properties.credit_pool = 'free') AS free_credits
  FROM events WHERE event IN ('signup', 'generate', 'purchase') AND timestamp >= ${at(window.prevStart)}
  GROUP BY person_id
  HAVING countIf(event = 'signup') > 0
)
WHERE ${bothPeriods(window, 'signed_at')}
GROUP BY cur LIMIT 2`,
  }
}

const activationRow = z.object({
  cur: flag,
  signups: count,
  active_24h: count,
  seconds_to_image: maybe,
  seconds_to_paid: maybe,
  used_gift: count,
  paid_after_gift: count,
})

export type ActivationStats = {
  signups: number
  active24hRate: number | null
  hoursToImage: number | null
  hoursToPaid: number | null
  usedGift: number
  paidAfterGiftRate: number | null
}
export type Activation = { current: ActivationStats; previous: ActivationStats }

const hours = (seconds: number | null) => (seconds === null ? null : seconds / 3600)

function statsOf(row: z.infer<typeof activationRow> | undefined): ActivationStats {
  if (!row) return { signups: 0, active24hRate: null, hoursToImage: null, hoursToPaid: null, usedGift: 0, paidAfterGiftRate: null }
  return {
    signups: row.signups,
    active24hRate: rate(row.active_24h, row.signups),
    hoursToImage: hours(row.seconds_to_image),
    hoursToPaid: hours(row.seconds_to_paid),
    usedGift: row.used_gift,
    paidAfterGiftRate: rate(row.paid_after_gift, row.used_gift),
  }
}

export function shapeActivation(rows: z.infer<typeof activationRow>[]): Activation {
  return { current: statsOf(rows.find((row) => row.cur)), previous: statsOf(rows.find((row) => !row.cur)) }
}

export async function loadActivation(run: RunQuery, window: Window, giftCredits: number): Promise<Activation> {
  return shapeActivation(rowsOf(await run(activationQuery(window, giftCredits)), activationRow))
}
