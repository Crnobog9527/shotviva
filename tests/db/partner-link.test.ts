import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { exchangeLinkCode, handleAccount, handleLink, issueLinkCode, readLinkStatus, revokeLink } from '@/core/partner'

import { connectAdmin } from './helpers'
import { createUser, linkedUser, linkRow, partnerRequest, PREVIEW_KEY, productionEnv, routeDeps } from './partner-fixtures'
import { serviceSupabase } from './supabase-env'

// AGENTS §7 item 7: the code is single-use and expires after 10 minutes, a revoked link is a
// 401, and a wrong or other-environment partner key is a 401.

let db: Client

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

const MINUTE = 60_000
const link = (code: string, key?: string | null) => handleLink(partnerRequest('/api/partner/link', { method: 'POST', key, body: { code } }), routeDeps())

describe('POST /api/partner/link', () => {
  it('exchanges a fresh code for the account and stores only its hash', async () => {
    const userId = await createUser(db, { credits: 3 })
    const code = await issueLinkCode(serviceSupabase(), userId)
    expect((await linkRow(db, userId))?.link_code).not.toContain(code)

    const response = await link(code)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      account_id: userId,
      display_name: 't***@example.test',
      credits_remaining: 3,
      free_credits_remaining: 0,
    })
    expect(await linkRow(db, userId)).toMatchObject({ link_code: null, revoked_at: null })
  })

  it('accepts a code only once, even when two exchanges race', async () => {
    const code = await issueLinkCode(serviceSupabase(), await createUser(db))
    const statuses = (await Promise.all([link(code), link(code)])).map((r) => r.status).sort()
    expect(statuses).toEqual([200, 422])
    const again = await link(code)
    expect(again.status).toBe(422)
    expect((await again.json()).code).toBe('invalid_input')
  })

  it('expires codes after 10 minutes', async () => {
    const userId = await createUser(db)
    const stale = await issueLinkCode(serviceSupabase(), userId, new Date(Date.now() - 11 * MINUTE))
    expect((await link(stale)).status).toBe(422)
    const recent = await issueLinkCode(serviceSupabase(), userId, new Date(Date.now() - 9 * MINUTE))
    expect((await link(recent)).status).toBe(200)
  })

  it('401s a wrong key or no key without burning the code', async () => {
    const code = await issueLinkCode(serviceSupabase(), await createUser(db))
    expect((await link(code, `sv_test_${'x'.repeat(40)}`)).status).toBe(401)
    expect((await link(code, null)).status).toBe(401)
    expect((await link(code)).status).toBe(200)
  })

  it('401s the preview key in production', async () => {
    const code = await issueLinkCode(serviceSupabase(), await createUser(db))
    const request = partnerRequest('/api/partner/link', { method: 'POST', key: PREVIEW_KEY, body: { code } })
    const response = await handleLink(request, { ...routeDeps(), env: productionEnv })
    expect(response.status).toBe(401)
    expect((await response.json()).code).toBe('unauthorized')
  })
})

const account = (accountId?: string, query = '') =>
  handleAccount(partnerRequest(`/api/partner/account${query}`, { account: accountId }), routeDeps())

describe('GET /api/partner/account and revocation', () => {
  it('answers credits, paid_until and a top-up link for a linked account', async () => {
    const userId = await linkedUser(db, { credits: 5, paidUntil: new Date('2030-01-01T00:00:00Z') })
    const response = await account(userId, '?return_to=https%3A%2F%2Fgraylum.com%2Fchat%2F7')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ credits_remaining: 5, free_credits_remaining: 0, paid_until: '2030-01-01T00:00:00.000Z' })
    const topUp = new URL(body.top_up_url)
    expect(topUp.searchParams.get('from')).toBe('graylum')
    expect(topUp.searchParams.get('return_to')).toBe('https://graylum.com/chat/7')
  })

  it('rejects a non-allowlisted return_to', async () => {
    const userId = await linkedUser(db)
    const response = await account(userId, '?return_to=https%3A%2F%2Fevil.example%2F')
    expect(response.status).toBe(422)
  })

  it('401s link_revoked after Disconnect, and works again after a new connect', async () => {
    const userId = await linkedUser(db)
    expect((await account(userId)).status).toBe(200)
    await revokeLink(serviceSupabase(), userId)
    const revoked = await account(userId)
    expect(revoked.status).toBe(401)
    expect((await revoked.json()).code).toBe('link_revoked')
    expect((await readLinkStatus(serviceSupabase(), userId)).connected).toBe(false)

    await exchangeLinkCode(serviceSupabase(), await issueLinkCode(serviceSupabase(), userId))
    expect((await account(userId)).status).toBe(200)
    expect((await readLinkStatus(serviceSupabase(), userId)).connected).toBe(true)
  })

  it('a code issued before Disconnect cannot re-link afterwards', async () => {
    const userId = await linkedUser(db)
    const pending = await issueLinkCode(serviceSupabase(), userId)
    await revokeLink(serviceSupabase(), userId)
    expect((await link(pending)).status).toBe(422)
    expect((await account(userId)).status).toBe(401)
  })

  it('401s unknown, unlinked and missing accounts alike', async () => {
    const unlinked = await createUser(db)
    await issueLinkCode(serviceSupabase(), unlinked)
    for (const id of [unlinked, '00000000-0000-4000-8000-000000000000', 'not-a-uuid', undefined]) {
      expect((await account(id)).status).toBe(401)
    }
  })
})
