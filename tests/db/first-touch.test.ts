import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { touchOf } from '@/core/attribution/first-touch'
import { sealTouch } from '@/core/attribution/seal'
import { recordFirstTouchAtSignIn } from '@/core/attribution/sign-in'

import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// First-touch attribution (ARCHITECTURE §16.6, migrations 1546–1547) through the sign-in path.

let db: Client
const service = serviceSupabase()
const secret = 'db-test-secret'
const touch = (href: string, referrer: string | null = null) => touchOf({ url: new URL(href), referrer, ownHost: 'shotviva.com', now: Date.parse('2026-11-14T08:00:00Z') })
const rowOf = async (user: string) => (await db.query('select * from public.account_first_touch where user_id = $1', [user])).rows[0]

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

describe('account_first_touch', () => {
  it('writes the sealed landing once, with typed columns', async () => {
    const user = await createUser(db)
    const sealed = sealTouch(touch('https://shotviva.com/zh/t/ramen-studio?s=k3x9m2pa&utm_source=test', 'https://news.ycombinator.com/item'), secret)
    await recordFirstTouchAtSignIn(service, user, sealed, secret)
    expect(await rowOf(user)).toMatchObject({
      landing_path: '/zh/t/ramen-studio?s=k3x9m2pa&utm_source=test',
      referrer_host: 'news.ycombinator.com',
      utm_source: 'test',
      share_template_id: 'ramen-studio',
      share_id: 'k3x9m2pa',
      graylum: false,
    })
    expect((await rowOf(user)).landed_at.toISOString()).toBe('2026-11-14T08:00:00.000Z')
    // A later sign-in from another browser changes nothing.
    await recordFirstTouchAtSignIn(service, user, sealTouch(touch('https://shotviva.com/pricing'), secret), secret)
    expect((await rowOf(user)).landing_path).toBe('/zh/t/ramen-studio?s=k3x9m2pa&utm_source=test')
  })

  it('writes nothing for a forged or foreign cookie', async () => {
    const user = await createUser(db)
    await recordFirstTouchAtSignIn(service, user, sealTouch(touch('https://shotviva.com/'), 'other-secret'), secret)
    await recordFirstTouchAtSignIn(service, user, 'eyJ2IjoxfQ.AAAA', secret)
    expect(await rowOf(user)).toBeUndefined()
  })

  it('refuses values outside the column rules at the database too', async () => {
    const user = await createUser(db)
    const { error } = await service.rpc('record_first_touch', { p_user: user, p_touch: { p: 'no-slash', at: 1_800_000_000 } })
    expect(error).not.toBeNull()
  })

  it('lets an account read only its own row, and no client write', async () => {
    const { data } = await anonSupabase().from('account_first_touch').select('user_id')
    expect(data ?? []).toEqual([])
    const { error } = await anonSupabase().rpc('record_first_touch', { p_user: '00000000-0000-0000-0000-000000000000', p_touch: {} })
    expect(error).not.toBeNull()
  })
})
