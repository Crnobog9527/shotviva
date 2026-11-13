import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import type { SignupGiftCapAlert } from './alert-kinds'

// 「注册赠送」 (1350, ARCHITECTURE §7): the signup gift has a daily cap per Beijing day. The Owner
// hears once when half of it is gone and once when it is used up, so a bot run shows up in the
// group the same day. Checked after a new account's first sign-in, in after() work. Nothing is
// said while the gift is paused (the Owner did that) or the cap is 0 (no gift at all).

const LOOKUP_TIMEOUT_MS = 5000
const todaySchema = z.object({ granted: z.number().int(), cap: z.number().int(), paused: z.boolean() })
export type SignupGiftToday = z.infer<typeof todaySchema>

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })

// The Beijing date, YYYY-MM-DD: the day the cap counts, and part of the alert's key.
export const beijingDay = (now: number) => DAY.format(new Date(now))

export function signupGiftAlert(today: SignupGiftToday, now: number): SignupGiftCapAlert | null {
  const { granted, cap, paused } = today
  if (paused || cap <= 0 || granted * 2 < cap) return null
  return { kind: 'signup_gift_cap', day: beijingDay(now), level: granted >= cap ? 'full' : 'half', granted, cap }
}

export async function readSignupGiftToday(db: SupabaseClient): Promise<SignupGiftToday> {
  const { data, error } = await db.rpc('signup_gift_today').abortSignal(AbortSignal.timeout(LOOKUP_TIMEOUT_MS))
  if (error) throw new Error(`signup_gift_today failed: ${error.message}`)
  return todaySchema.parse(data)
}
