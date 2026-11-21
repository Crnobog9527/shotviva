import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { callRpc, currentTier, effectiveLimits, effectiveTier, TIER_LIMITS } from '@/core/billing'
import { adminCreateOrg, adminGrantOrg, adminSaveOrgPackage, adminUpdateOrg, leaveOrg } from '@/core/org'

import { connectAdmin, serviceClient } from './helpers'
import { account, adminAccount, member, orgWith, type Plan } from './org-fixtures'

// effective_limits() and the org usage settings (ARCHITECTURE §6.5): each item is the larger of
// the tier value and the org value, the org value capped by system_settings.org_limit_caps; a
// suspended org or a removed member lifts nothing; tiers and prices never move.

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

const claimZip = (userId: string) =>
  callRpc(service, 'claim_batch_zip', { p_user_id: userId, p_batch_id: randomUUID(), p_token: randomUUID() }, z.string())

const LIFT = { concurrency: 5, per_window: 70, batch_max: 25, multi_template_max: 4, batch_zip: true, early_features: true }

describe('effective_limits outside an org', () => {
  it.each([
    [undefined, 'starter', 1],
    ['starter_monthly', 'starter', 1],
    ['pro_monthly', 'pro', 1],
    ['max_monthly', 'max', 5],
  ] as const)('repeats TIER_LIMITS for %s', async (plan, tier, templates) => {
    const userId = await account(db, service, { plan: plan as Plan | undefined })
    expect(await effectiveLimits(service, userId)).toMatchObject({
      ...TIER_LIMITS[tier], tier: plan ? tier : null, multiTemplateMax: templates, batchZip: tier !== 'starter', earlyFeatures: false, orgId: null,
    })
  })
})

describe('org usage', () => {
  it('takes the larger value per item and never moves the tier', async () => {
    const { orgId, token } = await orgWith(db, service, actor, { usage: LIFT })
    const starter = await member(db, service, token, { plan: 'starter_monthly' })
    expect(await effectiveLimits(service, starter)).toMatchObject({
      tier: 'starter', concurrency: 5, perWindow: 70, batchMax: 25, multiTemplateMax: 4, batchZip: true, earlyFeatures: true, orgId,
    })
    const max = await member(db, service, (await orgWith(db, service, actor, { usage: { concurrency: 2, batch_max: 12 } })).token, { plan: 'max_monthly' })
    expect(await effectiveLimits(service, max)).toMatchObject({ tier: 'max', concurrency: 6, perWindow: 80, batchMax: 30, multiTemplateMax: 5 })
    // current_tier and effective_tier stay exactly as before: org usage is not a plan.
    expect(await currentTier(service, starter)).toBe('starter')
    expect(await effectiveTier(service, starter)).toBe('starter')
  })

  it('lets the member download batch ZIPs below Pro only while the org is active', async () => {
    const { orgId, token } = await orgWith(db, service, actor, { usage: { batch_zip: true } })
    const userId = await member(db, service, token)
    expect(await claimZip(userId)).toBe('acquired')
    await adminUpdateOrg(service, actor, orgId, { status: 'suspended' })
    expect(await claimZip(userId)).toBe('upgrade')
    expect(await effectiveLimits(service, userId)).toMatchObject({ ...TIER_LIMITS.starter, batchZip: false, orgId: null })
  })

  it('lifts nothing once the member has left', async () => {
    const { token } = await orgWith(db, service, actor, { usage: LIFT })
    const userId = await member(db, service, token)
    await leaveOrg(service, userId, randomUUID())
    expect(await effectiveLimits(service, userId)).toMatchObject({ ...TIER_LIMITS.starter, orgId: null })
  })

  it('rejects values above the hard cap or below the minimum, and clamps when the cap drops', async () => {
    const { orgId, token } = await orgWith(db, service, actor)
    for (const usage of [{ batch_max: 31 }, { concurrency: 7 }, { per_window: 81 }, { multi_template_max: 6 }]) {
      await expect(adminUpdateOrg(service, actor, orgId, usage)).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'ORG_LIMIT_ABOVE_CAP' })
    }
    await expect(callRpc(service, 'admin_org_update', { p_actor: actor, p_org_id: orgId, p_input: { batch_max: 0 } }, z.string()))
      .rejects.toMatchObject({ message: 'INVALID_INPUT' })
    const owner = await account(db, service)
    await expect(adminCreateOrg(service, actor, { owner_user_id: owner, name: 'Too big', batch_max: 31 }))
      .rejects.toMatchObject({ message: 'ORG_LIMIT_ABOVE_CAP' })
    await adminUpdateOrg(service, actor, orgId, { batch_max: 30, concurrency: 6 })
    const userId = await member(db, service, token)
    const { rows } = await db.query("select value from public.system_settings where key = 'org_limit_caps'")
    try {
      await db.query(`update public.system_settings set value = value || '{"batch_max":20}' where key = 'org_limit_caps'`)
      expect(await effectiveLimits(service, userId)).toMatchObject({ batchMax: 20, concurrency: 6 })
    } finally {
      await db.query("update public.system_settings set value = $1 where key = 'org_limit_caps'", [rows[0].value])
    }
  })

  it('seeds the caps with the current Max values', async () => {
    const { rows } = await db.query("select value from public.system_settings where key = 'org_limit_caps'")
    expect(rows[0].value).toEqual({ concurrency: TIER_LIMITS.max.concurrency, per_window: TIER_LIMITS.max.perWindow, batch_max: TIER_LIMITS.max.batchMax, multi_template_max: 5 })
  })
})

describe('admin functions', () => {
  it('reject anyone but an unbanned admin', async () => {
    const outsider = await account(db, service)
    const banned = await account(db, service, { admin: true })
    await db.query('update public.profiles set banned_at = now() where id = $1', [banned])
    const { orgId } = await orgWith(db, service, actor)
    for (const who of [outsider, banned]) {
      await expect(adminCreateOrg(service, who, { owner_user_id: await account(db, service), name: 'x' })).rejects.toMatchObject({ message: 'NOT_ADMIN' })
      await expect(adminUpdateOrg(service, who, orgId, { name: 'x' })).rejects.toMatchObject({ message: 'NOT_ADMIN' })
      await expect(adminGrantOrg(service, who, { org_id: orgId, request_id: randomUUID(), credits: 10 })).rejects.toMatchObject({ message: 'NOT_ADMIN' })
      await expect(adminSaveOrgPackage(service, who, { name: 'x', price_usd_cents: 100, credits: 10 })).rejects.toMatchObject({ message: 'NOT_ADMIN' })
    }
  })

  it('save USD packages and grant their credits by default, keeping prices and tiers untouched', async () => {
    const products = await db.query('select md5(string_agg(row_to_json(p)::text, \'\' order by p.id)) as h from public.products p')
    const packageId = await adminSaveOrgPackage(service, actor, { name: 'Test tier', price_usd_cents: 123_400, credits: 4_321 })
    const { orgId, owner } = await orgWith(db, service, actor)
    const result = await adminGrantOrg(service, actor, { org_id: orgId, request_id: randomUUID(), package_id: packageId, amount_cny_fen: 900_000, reference: 'TT-1' })
    expect(result).toEqual({ applied: true, pool_credits: 4_321 })
    const after = await db.query('select md5(string_agg(row_to_json(p)::text, \'\' order by p.id)) as h from public.products p')
    expect(after.rows[0].h).toBe(products.rows[0].h)
    expect(await currentTier(service, owner)).toBeNull()
    const { rows } = await db.query('select action from public.admin_audit_log where user_id = $1 and target_id = $2', [actor, orgId])
    expect(rows.map((r) => r.action).sort()).toEqual(['org_create', 'org_grant'])
  })
})

describe('grants', () => {
  it('keep every org table and function away from the client roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['orgs', 'org_members', 'org_credit_ledger', 'org_packages', 'org_member_topups']) {
        const { rows } = await db.query('select has_table_privilege($1, $2, $3) as ok', [role, `public.${table}`, 'select'])
        expect(rows[0].ok, `${role} ${table}`).toBe(false)
      }
      const { rows } = await db.query(
        `select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and (p.proname like '%org\\_%' or p.proname = 'effective_limits')
            and has_function_privilege($1, p.oid, 'execute')`,
        [role],
      )
      expect(rows.map((r) => r.fn), role).toEqual([])
    }
  })
})
