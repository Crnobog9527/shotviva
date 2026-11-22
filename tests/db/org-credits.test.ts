import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { z } from 'zod'

import { adminAdjustCredits, callRpc } from '@/core/billing'
import {
  adminGrantOrg,
  adminUpdateOrg,
  allocateOrgCredits,
  depositOrgCredits,
  joinOrg,
  leaveOrg,
  removeOrgMember,
  runMonthlyTopup,
  setOrgAllowance,
} from '@/core/org'

import { reserveJob } from '@/core/jobs'

import { seedTemplate } from './generation-fixtures'
import { connectAdmin, ledgerOf, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'
import { account, adminAccount, creditsOf, member, memberRow, orgLedger, orgWith, poolOf } from './org-fixtures'

// Pool movements (ARCHITECTURE §6.5): request_id idempotency, no overdraft under concurrency,
// reclaim takes min(held, credits), the monthly top-up re-runs without granting twice, and only
// the owner moves the pool.

const service = serviceClient()
let db: Client
let actor: string

beforeAll(async () => {
  db = await connectAdmin()
  actor = await adminAccount(db, service)
})

afterAll(async () => {
  await db.end()
})

describe('request_id idempotency', () => {
  it('grants once per request and refuses a different grant under the same id', async () => {
    const { orgId } = await orgWith(db, service, actor)
    const grant = { org_id: orgId, request_id: `bank:${randomUUID()}`, credits: 500 }
    expect(await adminGrantOrg(service, actor, grant)).toEqual({ applied: true, pool_credits: 500 })
    expect(await adminGrantOrg(service, actor, grant)).toEqual({ applied: false, pool_credits: 500 })
    await expect(adminGrantOrg(service, actor, { ...grant, credits: 600 })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await orgLedger(db, orgId)).toHaveLength(1)
  })

  it('allocates once per request', async () => {
    const { owner, token } = await orgWith(db, service, actor, { pool: 300 })
    const userId = await member(db, service, token)
    const id = randomUUID()
    expect(await allocateOrgCredits(service, owner, userId, 100, id)).toMatchObject({ applied: true, pool_credits: 200, held_credits: 100 })
    expect(await allocateOrgCredits(service, owner, userId, 100, id)).toMatchObject({ applied: false, pool_credits: 200 })
    await expect(allocateOrgCredits(service, owner, userId, 50, id)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await creditsOf(db, userId)).toBe(100)
    expect((await ledgerOf(db, userId)).filter((row) => row.kind === 'org_allocate')).toEqual([
      { kind: 'org_allocate', pool: 'paid', delta: 100, idempotency_key: `org:${id}` },
    ])
  })
})

describe('owner checks', () => {
  it('refuses pool actions from a member, a stranger and a suspended org', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 100 })
    const userId = await member(db, service, token)
    const stranger = await account(db, service)
    for (const who of [userId, stranger]) {
      await expect(allocateOrgCredits(service, who, userId, 10, randomUUID())).rejects.toMatchObject({ message: 'NOT_ORG_OWNER' })
      await expect(setOrgAllowance(service, who, userId, 10)).rejects.toMatchObject({ message: 'NOT_ORG_OWNER' })
      await expect(removeOrgMember(service, who, userId, randomUUID())).rejects.toMatchObject({ message: 'NOT_ORG_OWNER' })
      await expect(depositOrgCredits(service, who, 10, randomUUID())).rejects.toMatchObject({ message: 'NOT_ORG_OWNER' })
    }
    await adminUpdateOrg(service, actor, orgId, { status: 'suspended' })
    await expect(allocateOrgCredits(service, owner, userId, 10, randomUUID())).rejects.toMatchObject({ message: 'ORG_SUSPENDED' })
    await expect(joinOrg(service, stranger, token)).rejects.toMatchObject({ message: 'ORG_SUSPENDED' })
    expect(await poolOf(db, orgId)).toBe(100)
  })

  it('keeps one active org per account and the owner in their own org', async () => {
    const first = await orgWith(db, service, actor)
    const second = await orgWith(db, service, actor)
    const userId = await member(db, service, first.token)
    expect(await joinOrg(service, userId, first.token)).toBe(first.orgId)
    await expect(joinOrg(service, userId, second.token)).rejects.toMatchObject({ message: 'ORG_MEMBER_EXISTS' })
    await expect(joinOrg(service, first.owner, second.token)).rejects.toMatchObject({ message: 'ORG_MEMBER_EXISTS' })
    await expect(joinOrg(service, userId, 'f'.repeat(32))).rejects.toMatchObject({ message: 'ORG_INVITE_INVALID' })
    await expect(leaveOrg(service, first.owner, randomUUID())).rejects.toMatchObject({ message: 'ORG_OWNER_CANNOT_LEAVE' })
    await expect(removeOrgMember(service, first.owner, first.owner, randomUUID())).rejects.toMatchObject({ message: 'ORG_OWNER_CANNOT_LEAVE' })
  })
})

describe('concurrent allocations', () => {
  it('never take the pool below zero', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 100 })
    const members = await Promise.all(Array.from({ length: 4 }, () => member(db, service, token)))
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => allocateOrgCredits(service, owner, members[i % 4]!, 30, randomUUID())),
    )
    const done = results.filter((r) => r.status === 'fulfilled').length
    expect(done).toBe(3)
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toMatchObject({ message: 'ORG_POOL_INSUFFICIENT' })
    expect(await poolOf(db, orgId)).toBe(10)
    const given = (await Promise.all(members.map((id) => creditsOf(db, id)))).reduce((a, b) => a + b, 0)
    expect(given).toBe(90)
    expect((await orgLedger(db, orgId)).at(-1)?.pool_after).toBe(10)
  })
})

describe('reclaim', () => {
  it('takes back min(held, credits): the member spends their own credits last', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 200 })
    const spender = await member(db, service, token, { credits: 50 })
    await allocateOrgCredits(service, owner, spender, 100, randomUUID())
    await adminAdjustCredits(service, { userId: spender, amount: -120, reason: 'spent', pool: 'paid' })
    expect(await removeOrgMember(service, owner, spender, randomUUID())).toBe(30)
    expect(await creditsOf(db, spender)).toBe(0)
    const saver = await member(db, service, token, { credits: 50 })
    await allocateOrgCredits(service, owner, saver, 100, randomUUID())
    const leaveId = randomUUID()
    expect(await leaveOrg(service, saver, leaveId)).toBe(100)
    expect(await leaveOrg(service, saver, leaveId)).toBe(0)
    expect(await creditsOf(db, saver)).toBe(50)
    expect(await poolOf(db, orgId)).toBe(130)
    expect(await memberRow(db, orgId, saver)).toMatchObject({ status: 'removed', held_credits: 0 })
  })
})

describe('owner deposit', () => {
  it('moves only the owner’s own credits, never the org-held share', async () => {
    const { orgId, owner } = await orgWith(db, service, actor, { pool: 100 })
    await db.query('update public.profiles set credits = 40 where id = $1', [owner])
    await allocateOrgCredits(service, owner, owner, 100, randomUUID())
    await expect(depositOrgCredits(service, owner, 41, randomUUID())).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    expect(await depositOrgCredits(service, owner, 40, randomUUID())).toEqual({ applied: true, pool_credits: 40 })
    expect(await creditsOf(db, owner)).toBe(100)
    expect(await poolOf(db, orgId)).toBe(40)
  })
})

describe('org_monthly_topup', () => {
  it('tops up to the allowance once per period, in join order until the pool is empty', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 250 })
    const first = await member(db, service, token)
    const second = await member(db, service, token)
    const idle = await member(db, service, token)
    await setOrgAllowance(service, owner, first, 100)
    await setOrgAllowance(service, owner, second, 200)
    // Orgs are new on every run, so fixed periods never meet an earlier run's rows.
    const period = '2098-03'
    await runMonthlyTopup(service, period)
    expect([await creditsOf(db, first), await creditsOf(db, second), await creditsOf(db, idle)]).toEqual([100, 150, 0])
    expect(await poolOf(db, orgId)).toBe(0)
    // Refilled and re-run: nobody is topped up twice in the same period.
    await adminGrantOrg(service, actor, { org_id: orgId, request_id: randomUUID(), credits: 500 })
    await adminAdjustCredits(service, { userId: first, amount: -60, reason: 'spent', pool: 'paid' })
    await runMonthlyTopup(service, period)
    expect([await creditsOf(db, first), await creditsOf(db, second)]).toEqual([40, 150])
    const { rows } = await db.query('select user_id, granted, short from public.org_member_topups where org_id = $1 and period = $2', [orgId, period])
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.user_id === second)).toMatchObject({ granted: 150, short: 50 })
    // Next period: brought back up to the allowance, not added on top.
    await runMonthlyTopup(service, '2098-04')
    expect([await creditsOf(db, first), await creditsOf(db, second)]).toEqual([100, 200])
    expect(await poolOf(db, orgId)).toBe(500 - 60 - 50)
  })

  it('skips suspended orgs and removed members', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 100 })
    const userId = await member(db, service, token)
    await setOrgAllowance(service, owner, userId, 50)
    await adminUpdateOrg(service, actor, orgId, { status: 'suspended' })
    await runMonthlyTopup(service, '2099-12')
    expect(await creditsOf(db, userId)).toBe(0)
    await adminUpdateOrg(service, actor, orgId, { status: 'active' })
    await removeOrgMember(service, owner, userId, randomUUID())
    await runMonthlyTopup(service, '2099-11')
    expect(await creditsOf(db, userId)).toBe(0)
    expect(await poolOf(db, orgId)).toBe(100)
  })
})

// Review of #777: held_credits must follow spending, so a member's later purchases are never
// counted as the org's.
describe('held credits follow spending', () => {
  it('spend, then buy, then leave: only what is left of the org credits goes back', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 100 })
    const userId = await member(db, service, token)
    await allocateOrgCredits(service, owner, userId, 100, randomUUID())
    await adminAdjustCredits(service, { userId, amount: -80, reason: 'spent', pool: 'paid' })
    expect(await memberRow(db, orgId, userId)).toMatchObject({ held_credits: 20 })
    await adminAdjustCredits(service, { userId, amount: 500, reason: 'bought', pool: 'paid' })
    expect(await leaveOrg(service, userId, randomUUID())).toBe(20)
    expect(await creditsOf(db, userId)).toBe(500)
    expect(await poolOf(db, orgId)).toBe(20)
  })

  it('tops a member who spent and then bought back up to the allowance', async () => {
    const { owner, token } = await orgWith(db, service, actor, { pool: 300 })
    const userId = await member(db, service, token)
    await setOrgAllowance(service, owner, userId, 100)
    await runMonthlyTopup(service, '2097-01')
    await adminAdjustCredits(service, { userId, amount: -80, reason: 'spent', pool: 'paid' })
    await adminAdjustCredits(service, { userId, amount: 500, reason: 'bought', pool: 'paid' })
    await runMonthlyTopup(service, '2097-02')
    expect(await creditsOf(db, userId)).toBe(600)
  })

  it('lets the owner deposit credits bought after spending the org share', async () => {
    const { orgId, owner } = await orgWith(db, service, actor, { pool: 100 })
    await allocateOrgCredits(service, owner, owner, 100, randomUUID())
    await adminAdjustCredits(service, { userId: owner, amount: -80, reason: 'spent', pool: 'paid' })
    await adminAdjustCredits(service, { userId: owner, amount: 500, reason: 'bought', pool: 'paid' })
    await expect(depositOrgCredits(service, owner, 501, randomUUID())).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    expect(await depositOrgCredits(service, owner, 500, randomUUID())).toEqual({ applied: true, pool_credits: 500 })
    expect(await memberRow(db, orgId, owner)).toMatchObject({ held_credits: 20 })
  })
})

describe('monthly top-up isolation', () => {
  it('refuses the top-up id prefix from every caller', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 100 })
    const userId = await member(db, service, token)
    const id = `org_topup:2097-03:${orgId}:${userId}`
    const calls = [
      () => callRpc(service, 'org_allocate', { p_owner: owner, p_member: userId, p_amount: 10, p_request_id: id }, z.unknown()),
      () => callRpc(service, 'org_deposit', { p_owner: owner, p_amount: 10, p_request_id: id }, z.unknown()),
      () => callRpc(service, 'org_leave', { p_user: userId, p_request_id: id }, z.unknown()),
      () => callRpc(service, 'org_remove_member', { p_owner: owner, p_member: userId, p_request_id: id }, z.unknown()),
      () => callRpc(service, 'admin_org_grant', { p_actor: actor, p_input: { org_id: orgId, request_id: id, credits: 10 } }, z.unknown()),
    ]
    for (const call of calls) await expect(call()).rejects.toMatchObject({ message: 'INVALID_INPUT' })
    expect(await poolOf(db, orgId)).toBe(100)
  })

  it('rolls back only the failing org, and a re-run tops up whoever was missed', async () => {
    const good = await orgWith(db, service, actor, { pool: 100 })
    const bad = await orgWith(db, service, actor, { pool: 100 })
    const fine = await member(db, service, good.token)
    const broken = await member(db, service, bad.token)
    await setOrgAllowance(service, good.owner, fine, 50)
    await setOrgAllowance(service, bad.owner, broken, 50)
    // A balance the grant would overflow: that org's top-up fails on its own.
    await db.query('update public.profiles set credits = 2147483600 where id = $1', [broken])
    const first = await runMonthlyTopup(service, '2097-05')
    expect(first.failed_orgs.map((f) => f.org_id)).toContain(bad.orgId)
    expect(first.failed_orgs.map((f) => f.org_id)).not.toContain(good.orgId)
    expect(await creditsOf(db, fine)).toBe(50)
    expect(await poolOf(db, bad.orgId)).toBe(100)
    await db.query('update public.profiles set credits = 0 where id = $1', [broken])
    const again = await runMonthlyTopup(service, '2097-05')
    expect(again.failed_orgs.map((f) => f.org_id)).not.toContain(bad.orgId)
    expect([await creditsOf(db, fine), await creditsOf(db, broken)]).toEqual([50, 50])
  })
})

describe('refunds and org transfers', () => {
  async function buyPack(userId: string) {
    const session = `cs_${randomUUID()}`
    const before = await creditsOf(db, userId)
    await db.query("select * from public.settle_checkout($1,'pack_s',$2,990,'usd',0,'card')", [userId, session])
    const payment = (await db.query('select id from public.payments where stripe_session_id = $1', [session])).rows[0]
    return { credits: (await creditsOf(db, userId)) - before, paymentId: payment.id as string }
  }

  it('counts a deposit into the org pool as using the credits', async () => {
    const { owner } = await orgWith(db, service, actor)
    const { paymentId, credits } = await buyPack(owner)
    await depositOrgCredits(service, owner, credits, randomUUID())
    const { rows } = await db.query('select no_credits_used from public.refund_eligibility($1, now())', [paymentId])
    expect(rows[0].no_credits_used).toBe(false)
  })

  it('claws back only the member’s own credits, never the org-held share', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 100 })
    const userId = await member(db, service, token)
    await allocateOrgCredits(service, owner, userId, 100, randomUUID())
    const { paymentId, credits } = await buyPack(userId)
    await adminAdjustCredits(service, { userId, amount: -(credits + 30), reason: 'spent', pool: 'paid' })
    await db.query("update public.payments set status = 'refunded', amount_refunded = amount_total where id = $1", [paymentId])
    const { rows } = await db.query("select public.clawback_payment_credits($1, 'org_test', 'refund') as r", [paymentId])
    // Own credits went first: all of the pack was spent, so nothing of it is left to take, and
    // the 70 org credits left stay with the org.
    expect(rows[0].r).toMatchObject({ taken: 0, written_off: credits })
    expect(await memberRow(db, orgId, userId)).toMatchObject({ held_credits: 70 })
    expect(await creditsOf(db, userId)).toBe(70)
  })
})

// Re-review of #777: a refund gives back the org share its reserve took, so failed jobs leave the
// split as it was and cannot be repeated to move org credits to the member.
describe('refunds give the org share back', () => {
  let template: string
  let cost: number
  beforeAll(async () => {
    template = await seedTemplate(db)
    cost = (await db.query(`select (credits_cost->>'1k')::int as cost from public.templates where id = $1`, [template])).rows[0].cost
  })

  const reserve = (userId: string) => {
    const jobId = randomUUID()
    return reserveJob(serviceSupabase(), { jobId, userId, module: 'image', templateId: template, expectedCredits: cost, source: 'web',
      inputs: { resolution: '1k', attempt_id: randomUUID() } }).then(() => jobId)
  }
  const fail = (jobId: string) => db.query("select public.refund_job($1, 'TEST_FAILED')", [jobId])

  it('reserve, failed refund, then leave: all 100 go back to the pool', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 100 })
    const userId = await member(db, service, token)
    await allocateOrgCredits(service, owner, userId, 100, randomUUID())
    const jobId = await reserve(userId)
    expect(await memberRow(db, orgId, userId)).toMatchObject({ held_credits: 100 - cost })
    await fail(jobId)
    await fail(jobId)
    expect(await memberRow(db, orgId, userId)).toMatchObject({ held_credits: 100 })
    expect(await leaveOrg(service, userId, randomUUID())).toBe(100)
    expect(await creditsOf(db, userId)).toBe(0)
    expect(await poolOf(db, orgId)).toBe(100)
  })

  it('repeated failures never grow the member’s own share', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 100 })
    const userId = await member(db, service, token, { credits: 10 })
    await allocateOrgCredits(service, owner, userId, 100, randomUUID())
    for (let i = 0; i < 4; i++) await fail(await reserve(userId))
    expect(await creditsOf(db, userId)).toBe(110)
    expect(await memberRow(db, orgId, userId)).toMatchObject({ held_credits: 100 })
    // A succeeded job keeps its draw: a member's job is paid from the org's share (1897), own 10 untouched.
    await reserve(userId)
    expect(await memberRow(db, orgId, userId)).toMatchObject({ held_credits: 100 - cost })
    expect(await creditsOf(db, userId)).toBe(110 - cost)
  })

  it('maps a poster photo refund to its reserve', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 50 })
    const userId = await member(db, service, token)
    await allocateOrgCredits(service, owner, userId, 50, randomUUID())
    const id = randomUUID()
    await db.query("select public._apply_credit_change($1, 'paid', 'reserve', -5, 'poster photo', $2)", [userId, `poster_photo:${id}:reserve`])
    expect(await memberRow(db, orgId, userId)).toMatchObject({ held_credits: 45 })
    await db.query("select public._apply_credit_change($1, 'paid', 'refund', 5, 'poster photo refund', $2)", [userId, `poster_photo:${id}:refund`])
    expect(await memberRow(db, orgId, userId)).toMatchObject({ held_credits: 50 })
  })
})

// Third review of #777: a refund that arrives after the member left belongs to the org.
describe('refunds after leaving', () => {
  let template: string
  let cost: number
  beforeAll(async () => {
    template = await seedTemplate(db)
    cost = (await db.query(`select (credits_cost->>'1k')::int as cost from public.templates where id = $1`, [template])).rows[0].cost
  })
  const reserve = async (userId: string) => {
    const jobId = randomUUID()
    await reserveJob(serviceSupabase(), { jobId, userId, module: 'image', templateId: template, expectedCredits: cost, source: 'web',
      inputs: { resolution: '1k', attempt_id: randomUUID() } })
    return jobId
  }
  const fail = (jobId: string) => db.query("select public.refund_job($1, 'TEST_FAILED')", [jobId])

  it.each(['leave', 'removed'] as const)('allocate, reserve, %s, then the refund goes to the org pool', async (how) => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: cost })
    const userId = await member(db, service, token)
    await allocateOrgCredits(service, owner, userId, cost, randomUUID())
    const jobId = await reserve(userId)
    const back = how === 'leave' ? await leaveOrg(service, userId, randomUUID()) : await removeOrgMember(service, owner, userId, randomUUID())
    expect(back).toBe(0)
    await fail(jobId)
    await fail(jobId)
    expect(await creditsOf(db, userId)).toBe(0)
    // Queued until the org row is next locked; any owner action settles it.
    await setOrgAllowance(service, owner, owner, 0)
    expect(await poolOf(db, orgId)).toBe(cost)
    expect((await orgLedger(db, orgId)).filter((row) => row.request_id.startsWith('org_return:'))).toEqual([
      expect.objectContaining({ kind: 'reclaim', delta: cost, pool_after: cost }),
    ])
  })

  it('keeps the member’s own part of a refund when their own credits paid first', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: cost })
    const userId = await member(db, service, token, { credits: 5 })
    await allocateOrgCredits(service, owner, userId, cost, randomUUID())
    const jobId = await reserve(userId)
    await leaveOrg(service, userId, randomUUID())
    await fail(jobId)
    await runMonthlyTopup(service, '2097-07')
    expect(await creditsOf(db, userId)).toBe(5)
    expect(await poolOf(db, orgId)).toBe(cost)
  })

  it('refuses the org_return: prefix from callers', async () => {
    const { orgId, owner } = await orgWith(db, service, actor, { pool: 10 })
    await expect(callRpc(service, 'org_deposit', { p_owner: owner, p_amount: 1, p_request_id: 'org_return:x' }, z.unknown()))
      .rejects.toMatchObject({ message: 'INVALID_INPUT' })
    await expect(callRpc(service, 'admin_org_grant', { p_actor: actor, p_input: { org_id: orgId, request_id: 'org_return:x', credits: 1 } }, z.unknown()))
      .rejects.toMatchObject({ message: 'INVALID_INPUT' })
  })
})

describe('admin clawback', () => {
  it('previews and takes only the member’s own credits', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 100 })
    const userId = await member(db, service, token)
    await allocateOrgCredits(service, owner, userId, 100, randomUUID())
    const session = `cs_${randomUUID()}`
    await db.query("select * from public.settle_checkout($1,'pack_s',$2,990,'usd',0,'card')", [userId, session])
    const paymentId = (await db.query('select id from public.payments where stripe_session_id = $1', [session])).rows[0].id
    const granted = (await creditsOf(db, userId)) - 100
    await adminAdjustCredits(service, { userId, amount: -(granted - 10), reason: 'spent', pool: 'paid' })
    const preview = (await db.query('select public.payment_clawback_preview($1) as p', [paymentId])).rows[0].p
    expect(preview).toMatchObject({ balance: 110, org_held: 100, available: 10 })
    const taken = (await db.query('select public.admin_clawback_payment($1, $2) as r', [paymentId, actor])).rows[0].r
    expect(taken).toMatchObject({ taken: 10 })
    expect(await creditsOf(db, userId)).toBe(100)
    expect(await memberRow(db, orgId, userId)).toMatchObject({ held_credits: 100 })
  })
})

// Fourth review of #777: a member's debit holds the profile and its trigger then references the
// org row (FOR KEY SHARE via org_held_draws' foreign key), while an org function holds the org row
// and waits for that profile. With the org row locked FOR NO KEY UPDATE the two do not deadlock.
describe('allocation racing a debit', () => {
  it('completes both, in either order of arrival', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 200 })
    const userId = await member(db, service, token)
    await allocateOrgCredits(service, owner, userId, 100, randomUUID())
    const debit = await connectAdmin()
    const allocate = await connectAdmin()
    try {
      await debit.query('begin')
      await debit.query("set local lock_timeout = '10s'")
      await debit.query('select 1 from public.profiles where id = $1 for update', [userId])
      const pid = (await allocate.query('select pg_backend_pid() as pid')).rows[0].pid
      const allocated = allocate.query("select public.org_allocate($1, $2, 50, $3) as r", [owner, userId, randomUUID()])
      // Wait until the allocation holds the org row and is blocked on the profile.
      for (let i = 0; i < 100; i++) {
        const { rows } = await db.query('select wait_event_type from pg_stat_activity where pid = $1', [pid])
        if (rows[0]?.wait_event_type === 'Lock') break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      // A reserve below held_credits writes a draw row: KEY SHARE on the org row the allocation holds.
      await debit.query("select public._apply_credit_change($1, 'paid', 'reserve', -60, 'race', $2)", [userId, `job:${randomUUID()}:reserve`])
      await debit.query('commit')
      expect((await allocated).rows[0].r).toMatchObject({ applied: true, pool_credits: 50 })
    } finally {
      await debit.end()
      await allocate.end()
    }
    expect(await creditsOf(db, userId)).toBe(90)
    expect(await memberRow(db, orgId, userId)).toMatchObject({ held_credits: 90 })
    expect(await poolOf(db, orgId)).toBe(50)
  })
})
