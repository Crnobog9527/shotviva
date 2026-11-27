import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { TEST_SIGNUP_GIFT_PER_IP } from './global-setup'
import { connectAdmin, createUser, uniqueIp } from './helpers'

// 2026 (ARCHITECTURE §7): the daily catch-up pays each pending 'daily_cap' account in its own
// transaction (signup_gift_catch_up_one per RPC call), so it never holds the site-wide cap lock
// while it takes another account's per-IP lock. A sign-in takes the IP lock, then the cap lock;
// the catch-up running beside sign-ins on the same networks must never deadlock with them.
// Separate sessions, so the data is committed (fresh networks, fake data only); the per-network
// setting is put back afterwards.

let admin: Client
let cron: Client
let signIns: Client[]
beforeAll(async () => {
  admin = await connectAdmin()
  cron = await connectAdmin()
  signIns = await Promise.all([connectAdmin(), connectAdmin()])
  // Large enough for two gifts per network, and > 0 so every grant takes the per-IP lock.
  await admin.query("insert into system_settings(key,value) values('signup_gift_per_ip','10'::jsonb) on conflict(key) do update set value=excluded.value")
})
afterAll(async () => {
  await admin.query("update system_settings set value=$1::jsonb where key='signup_gift_per_ip'", [JSON.stringify(TEST_SIGNUP_GIFT_PER_IP)])
  await Promise.all([admin, cron, ...signIns].map((c) => c.end()))
})

const grant = (c: Client, user: string) => c.query("select (grant_credits($1::uuid,1,'signup',$2,'free')).applied ok", [user, 'signup:' + user]).then((r) => r.rows[0].ok as boolean)

it('the catch-up beside sign-ins on the same networks pays everyone without a deadlock', async () => {
  for (let round = 0; round < 3; round++) {
    const networks = Array.from({ length: 4 }, () => uniqueIp())
    const pending: string[] = []
    const fresh: string[] = []
    for (const address of networks) {
      const p = await createUser(admin)
      await admin.query("update profiles set signup_ip=$2, signup_gift_refusal='daily_cap' where id=$1", [p, address])
      pending.push(p)
      const n = await createUser(admin)
      await admin.query('update profiles set signup_ip=$2 where id=$1', [n, address])
      fresh.push(n)
    }
    // The cron walks the networks in one order, the sign-ins in the other.
    const cronRun = (async () => {
      const out: string[] = []
      for (const p of pending) out.push((await cron.query('select signup_gift_catch_up_one($1) r', [p])).rows[0].r as string)
      return out
    })()
    const reversed = [...fresh].reverse()
    const signInRuns = signIns.map(async (c, i) => {
      const out: boolean[] = []
      for (const n of reversed.filter((_, j) => j % signIns.length === i)) out.push(await grant(c, n))
      return out
    })
    const [cronOut, ...signInOut] = await Promise.all([cronRun, ...signInRuns])
    expect(cronOut).toEqual(['paid', 'paid', 'paid', 'paid'])
    expect(signInOut.flat()).toEqual([true, true, true, true])
    const paid = await admin.query("select count(*)::int n from credit_ledger where idempotency_key = any($1::text[])", [[...pending, ...fresh].map((u) => 'signup:' + u)])
    expect(paid.rows[0].n).toBe(8)
  }
})
