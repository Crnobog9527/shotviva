import { connectAdmin } from './helpers'

// 1350: the signup gift has a site-wide daily cap (default 30). The DB suite gives far more than
// 30 signup gifts in one run, so it starts with a cap no run reaches; signup-guard.test.ts sets
// its own low cap and puts this one back.
export const TEST_SIGNUP_GIFT_CAP = 100_000
// 1480: one network may receive signup_gift_per_ip gifts a day (default 5). The suite's older
// same-IP tests expect the second account on a network to go without, so it runs with 1;
// signup-gift-claims.test.ts sets its own and puts this one back.
export const TEST_SIGNUP_GIFT_PER_IP = 1

export default async function setup() {
  const db = await connectAdmin()
  try {
    for (const [key, value] of [
      ['signup_gift_daily_cap', TEST_SIGNUP_GIFT_CAP],
      ['signup_gift_per_ip', TEST_SIGNUP_GIFT_PER_IP],
    ] as const) {
      await db.query(
        `insert into public.system_settings (key, value) values ($1, $2::jsonb)
         on conflict (key) do update set value = excluded.value`,
        [key, JSON.stringify(value)],
      )
    }
    await db.query(`delete from public.system_settings where key in ('signup_gift_paused', 'signup_gift_claim_phone', 'signup_gift_claim_google')`)
  } finally {
    await db.end()
  }
}
