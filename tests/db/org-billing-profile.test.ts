import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { checkoutBillingProfile, clearBillingProfile, getBillingProfile, saveBillingProfile } from '@/core/org/billing'

import { anonClient, connectAdmin, serviceClient } from './helpers'
import { account, adminAccount, member, orgWith } from './org-fixtures'

// 开票信息 (1960–1961, ARCHITECTURE §6.5): only the org's CURRENT owner reads and writes it, every
// save and clear leaves an event row, and the checkout read answers null for anyone else. Fake data only.

const service = serviceClient()
let db: Client
let actor: string

const PROFILE = { legalName: '上海示例科技有限公司', taxId: '91310000MA1FL0000X', country: 'CN', postcode: '200000' }

beforeAll(async () => {
  db = await connectAdmin()
  actor = await adminAccount(db, service)
})
afterAll(async () => { await db.end() })

const events = async (orgId: string) =>
  (await db.query<{ action: string; actor: string; profile: Record<string, unknown> | null }>(
    'select action, actor, profile from public.org_billing_profile_events where org_id = $1 order by id', [orgId])).rows

describe('owner only', () => {
  it('the owner saves, reads and clears; each change is recorded', async () => {
    const { orgId, owner } = await orgWith(db, service, actor)
    expect(await getBillingProfile(service, owner)).toBeNull()
    const saved = await saveBillingProfile(service, owner, { ...PROFILE, taxId: '91310000ma1fl0000x', invoiceEmail: ' Finance@Example.com ' })
    expect(saved).toMatchObject({ legalName: PROFILE.legalName, taxId: PROFILE.taxId, country: 'CN', postcode: '200000', state: null, invoiceEmail: 'finance@example.com' })
    expect(await getBillingProfile(service, owner)).toMatchObject({ taxId: PROFILE.taxId })
    expect(await checkoutBillingProfile(service, owner)).toMatchObject({ legalName: PROFILE.legalName })
    expect(await clearBillingProfile(service, owner)).toBe(true)
    expect(await clearBillingProfile(service, owner)).toBe(false)
    expect(await getBillingProfile(service, owner)).toBeNull()
    const log = await events(orgId)
    expect(log.map((e) => e.action)).toEqual(['save', 'clear'])
    expect(log[0]).toMatchObject({ actor: owner, profile: { tax_id: PROFILE.taxId, legal_name: PROFILE.legalName } })
  })

  it('a member or an outsider is denied, and the checkout read gives them nothing', async () => {
    const { owner, token } = await orgWith(db, service, actor)
    await saveBillingProfile(service, owner, PROFILE)
    const staff = await member(db, service, token)
    const outsider = await account(db, service)
    for (const user of [staff, outsider]) {
      await expect(getBillingProfile(service, user)).rejects.toThrow('NOT_ORG_OWNER')
      await expect(saveBillingProfile(service, user, PROFILE)).rejects.toThrow('NOT_ORG_OWNER')
      await expect(clearBillingProfile(service, user)).rejects.toThrow('NOT_ORG_OWNER')
      expect(await checkoutBillingProfile(service, user)).toBeNull()
    }
    expect(await getBillingProfile(service, owner)).toMatchObject({ taxId: PROFILE.taxId })
  })

  it('clients cannot call the functions or read the tables', async () => {
    const { owner } = await orgWith(db, service, actor)
    const anon = anonClient()
    for (const [fn, args] of [
      ['org_billing_profile_get', { p_owner: owner }],
      ['org_billing_profile_save', { p_owner: owner, p_legal_name: 'X Co', p_tax_id: PROFILE.taxId, p_country: 'CN' }],
      ['org_billing_profile_clear', { p_owner: owner }],
      ['org_checkout_billing_profile', { p_user: owner }],
    ] as const) {
      expect((await anon.rpc(fn, args)).error).not.toBeNull()
    }
    expect((await anon.select('org_billing_profiles')).ok).toBe(false)
    expect((await anon.select('org_billing_profile_events')).ok).toBe(false)
  })
})

describe('validation in the database', () => {
  it('refuses a malformed China tax ID, a blank name and a bad email even when called directly', async () => {
    const { owner } = await orgWith(db, service, actor)
    const call = (args: Record<string, unknown>) => service.rpc('org_billing_profile_save', {
      p_owner: owner, p_legal_name: PROFILE.legalName, p_tax_id: PROFILE.taxId, p_country: 'CN', ...args,
    })
    expect((await call({ p_tax_id: '12345' })).error?.message).toBe('INVALID_INPUT')
    expect((await call({ p_legal_name: ' ' })).error?.message).toBe('INVALID_INPUT')
    expect((await call({ p_invoice_email: 'nope' })).error?.message).toBe('INVALID_INPUT')
    expect((await call({ p_country: 'china' })).error?.message).toBe('INVALID_INPUT')
    expect((await call({ p_country: 'ZZ', p_tax_id: '201912345K' })).error?.message).toBe('INVALID_INPUT')
    expect((await call({ p_country: 'US', p_tax_id: '12-3456789' })).error?.message).toBe('INVALID_INPUT')
    expect((await call({ p_country: 'US', p_tax_id: '12-3456789', p_state: 'California' })).error?.message).toBe('INVALID_INPUT')
    expect((await call({ p_country: 'US', p_tax_id: '12-3456789', p_state: 'ca' })).data).toMatchObject({ state: 'CA' })
    expect((await call({ p_country: 'SG', p_tax_id: '201912345K' })).error).toBeNull()
  })
})

describe('ownership transfer', () => {
  it('the new owner gets the profile; the former owner loses it', async () => {
    const { orgId, owner } = await orgWith(db, service, actor)
    await saveBillingProfile(service, owner, PROFILE)
    const next = await account(db, service)
    // The org's owner changes (admin transfer, #840, sets orgs.owner_user_id the same way).
    await db.query('update public.orgs set owner_user_id = $1 where id = $2', [next, orgId])
    expect(await getBillingProfile(service, next)).toMatchObject({ taxId: PROFILE.taxId })
    expect(await checkoutBillingProfile(service, next)).toMatchObject({ legalName: PROFILE.legalName })
    await expect(getBillingProfile(service, owner)).rejects.toThrow('NOT_ORG_OWNER')
    expect(await checkoutBillingProfile(service, owner)).toBeNull()
    await saveBillingProfile(service, next, { ...PROFILE, legalName: '新公司名有限公司' })
    expect((await events(orgId)).at(-1)).toMatchObject({ actor: next, action: 'save' })
  })
})
