import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { adminAdjustCredits } from '@/core/billing'
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

import { connectAdmin, ledgerOf, serviceClient } from './helpers'
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
