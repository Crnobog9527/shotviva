import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { adminSavePaymentAccount, getOrgPaymentAccounts } from '@/core/org'

import { connectAdmin, serviceClient } from './helpers'
import { account, adminAccount, member, orgWith } from './org-fixtures'

// Receiving accounts for offline enterprise payments (1660). Values here are obviously fake.

const service = serviceClient()
let db: Client
let actor: string

const US = { account_name: 'Fake Co LLC', bank_name: 'Fake Bank', account_number: '000-FAKE-0000', routing_aba: '000000000' }

beforeAll(async () => {
  db = await connectAdmin()
  actor = await adminAccount(db, service)
  await db.query('delete from public.org_payment_accounts')
})
afterAll(async () => {
  await db.query('delete from public.org_payment_accounts')
  await db.end()
})

describe('admin_org_payment_account_save', () => {
  it('saves a group, then needs the current updated_at; a stale or missing one is ORG_CHANGED', async () => {
    const first = await adminSavePaymentAccount(service, actor, { kind: 'overseas_us', enabled: true, details: US })
    await expect(adminSavePaymentAccount(service, actor, { kind: 'overseas_us', enabled: true, details: US })).rejects.toMatchObject({ message: 'ORG_CHANGED' })
    await expect(adminSavePaymentAccount(service, actor, { kind: 'overseas_us', enabled: true, details: US, expected_updated_at: '2020-01-01T00:00:00Z' })).rejects.toMatchObject({ message: 'ORG_CHANGED' })
    const second = await adminSavePaymentAccount(service, actor, { kind: 'overseas_us', enabled: true, details: { ...US, currency: 'USD' }, expected_updated_at: first })
    expect(second).not.toBe(first)
  })
  it('refuses an unknown field, a field of the other group, a non-admin, and enabling without the key fields', async () => {
    await expect(adminSavePaymentAccount(service, actor, { kind: 'mainland_agent', enabled: false, details: { routing_aba: '1' } })).rejects.toMatchObject({ message: 'INVALID_INPUT' })
    await expect(adminSavePaymentAccount(service, actor, { kind: 'mainland_agent', enabled: false, details: { bogus: '1' } })).rejects.toMatchObject({ message: 'INVALID_INPUT' })
    await expect(adminSavePaymentAccount(service, actor, { kind: 'mainland_agent', enabled: true, details: { account_name: 'Fake' } })).rejects.toMatchObject({ message: 'INVALID_INPUT' })
    const user = await account(db, service)
    await expect(adminSavePaymentAccount(service, user, { kind: 'mainland_agent', enabled: false, details: {} })).rejects.toMatchObject({ message: 'NOT_ADMIN' })
  })
  it('writes an audit entry that names the group but never the account values', async () => {
    const { rows } = await db.query<{ target_id: string; reason: string }>(
      "select target_id, reason from public.admin_audit_log where action = 'org_update' and target_id like 'payment_account:%' and user_id = $1", [actor])
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.reason + row.target_id).not.toContain('FAKE')
  })
})

describe('org_payment_accounts_for_owner', () => {
  it('gives the org owner only the enabled groups, and nobody else anything', async () => {
    await adminSavePaymentAccount(service, actor, { kind: 'mainland_agent', enabled: false, details: { account_name: 'Fake Agent', bank_name: 'Fake Bank', account_number: '000-FAKE-1111', branch: 'Fake Branch' } })
    const { owner, token } = await orgWith(db, service, actor)
    const groups = await getOrgPaymentAccounts(service, owner)
    expect(groups.map((g) => g.kind)).toEqual(['overseas_us'])
    expect(groups[0]!.details.account_number).toBe('000-FAKE-0000')
    const staff = await member(db, service, token)
    await expect(getOrgPaymentAccounts(service, staff)).rejects.toMatchObject({ message: 'NOT_ORG_OWNER' })
    await expect(getOrgPaymentAccounts(service, await account(db, service))).rejects.toMatchObject({ message: 'NOT_ORG_OWNER' })
  })
  it('is not callable by clients', async () => {
    const { rows } = await db.query<{ n: string }>(
      "select count(*) n from information_schema.routine_privileges where routine_name in ('org_payment_accounts_for_owner','admin_org_payment_account_save') and lower(grantee) in ('anon','authenticated','public')")
    expect(Number(rows[0]!.n)).toBe(0)
  })
})
