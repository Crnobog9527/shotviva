import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../billing/rpc'
import { logger } from '../logger'

// The daily catch-up of signup gifts the daily cap left pending (migration 2026, ARCHITECTURE §7):
// reads the queue (oldest sign-up first, at most CATCH_UP_BATCH), then pays each account with its
// own RPC call, so each is its own transaction and no lock is held from one account to the next
// (grant_credits takes the account's IP lock before the cap lock; holding the cap lock across
// accounts would invert that). Stops as soon as the gift is paused or today's cap is full. A
// pending account is also paid at its next verified sign-in on a day with room; this run covers
// the accounts that do not come back.
export const CATCH_UP_BATCH = 50

const queueSchema = z.array(z.string().uuid())
const outcomeSchema = z.enum(['paid', 'skipped', 'same_ip_pending', 'paused', 'daily_cap'])

export type CatchUpSummary = { queued: number; paid: number; tried: number; failed: number; stopped: 'paused' | 'daily_cap' | null }

export async function catchUpSignupGifts(client: RpcClient): Promise<CatchUpSummary> {
  const queue = await callRpc(client, 'signup_gift_catch_up_queue', { p_limit: CATCH_UP_BATCH }, queueSchema)
  const summary: CatchUpSummary = { queued: queue.length, paid: 0, tried: 0, failed: 0, stopped: null }
  for (const userId of queue) {
    summary.tried += 1
    let outcome: z.infer<typeof outcomeSchema>
    try {
      outcome = await callRpc(client, 'signup_gift_catch_up_one', { p_user_id: userId }, outcomeSchema)
    } catch (error) {
      summary.failed += 1
      logger.error('signup gift catch-up account failed', { userId, error })
      continue
    }
    if (outcome === 'paid') summary.paid += 1
    if (outcome === 'paused' || outcome === 'daily_cap') {
      summary.stopped = outcome
      break
    }
  }
  return summary
}
