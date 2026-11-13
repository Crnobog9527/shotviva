import { connectAdmin } from './helpers'

// 1350: the signup gift has a site-wide daily cap (default 30). The DB suite gives far more than
// 30 signup gifts in one run, so it starts with a cap no run reaches; signup-guard.test.ts sets
// its own low cap and puts this one back.
export const TEST_SIGNUP_GIFT_CAP = 100_000

export default async function setup() {
  const db = await connectAdmin()
  try {
    await db.query(
      `insert into public.system_settings (key, value) values ('signup_gift_daily_cap', $1::jsonb)
       on conflict (key) do update set value = excluded.value`,
      [JSON.stringify(TEST_SIGNUP_GIFT_CAP)],
    )
    await db.query(`delete from public.system_settings where key = 'signup_gift_paused'`)
  } finally {
    await db.end()
  }
}
