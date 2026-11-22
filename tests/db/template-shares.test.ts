import { randomUUID } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTemplateShare, listTemplateShares, readTemplateShare, revokeTemplateShare, type TemplateShareItem } from '@/core/template-shares'

import { connectAdmin, publishFixture } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'
import { signedIn, wishlistUser, type WishlistUser } from './wishlist-fixtures'

// Template collection share links (ARCHITECTURE §5.1g) on the real database: only live web
// templates and series can be picked, in the order given; RLS shows each account only its own
// links; clients cannot write or call the functions; revoking is the owner's alone; creating is
// rate limited per account.

const tag = randomUUID().slice(0, 8)
const category = `qa-tshare-${tag}`
const [liveA, liveB, member, draft] = ['a', 'b', 'm', 'd'].map((suffix) => `qa-tshare-${tag}-${suffix}`) as [string, string, string, string]

let db: Client
let alice: WishlistUser
let bob: WishlistUser
let aliceClient: SupabaseClient
let bobClient: SupabaseClient
let series: string
let hidden: string
const service = serviceSupabase()

beforeAll(async () => {
  db = await connectAdmin()
  await db.query("insert into public.template_categories(key,name_en,name_zh) values($1,$2,$3)", [category, `QA share ${tag}`, `分享测试${tag}`])
  await db.query(`insert into public.templates(id,name,category_key,fields,cover_after_url,is_active,visible_in)
    select id,id,$2,'{"images":{"min":1,"max":1},"copy":[],"aspectRatios":["1:1"]}','https://example.test/m.webp',false,array['web']
    from unnest($1::text[]) id`, [[liveA, liveB, member, draft], category])
  await publishFixture(db, liveA, liveB, member)
  series = (await db.query(`insert into public.template_series(slug,name_en,name_zh,category_key,is_active) values ($1,'S','S',$2,true) returning id`, [`qa-tshare-${tag}`, category])).rows[0].id
  hidden = (await db.query(`insert into public.template_series(slug,name_en,name_zh,category_key,is_active) values ($1,'H','H',$2,false) returning id`, [`qa-tshare-${tag}-h`, category])).rows[0].id
  await db.query('update public.templates set series_id=$1 where id=$2', [series, member])
  alice = await wishlistUser(db, { session: true, eligible: false })
  bob = await wishlistUser(db, { session: true, eligible: false })
  aliceClient = await signedIn(alice)
  bobClient = await signedIn(bob)
}, 60_000)

afterAll(async () => {
  if (alice && bob) await db.query('delete from public.template_shares where user_id = any($1)', [[alice.id, bob.id]])
  await db.end()
})

const pick = (...ids: string[]): TemplateShareItem[] => ids.map((id) => (id === series || id === hidden ? { type: 'series', id } : { type: 'template', id }))

describe('creating a link', () => {
  it('keeps the picks in order, with the title and note, blank meaning none', async () => {
    const id = await createTemplateShare(service, alice.id, { items: pick(liveB, series, member, liveA), title: 'Spring', note: '  ' })
    expect(id).toMatch(/^[a-z0-9]{12}$/)
    const share = await readTemplateShare(service, id)
    expect(share).toMatchObject({ id, title: 'Spring', note: null, revokedAt: null, items: pick(liveB, series, member, liveA) })
  })

  it('refuses a template or series that is not live, a duplicate, and an empty list', async () => {
    await expect(createTemplateShare(service, alice.id, { items: pick(liveA, draft) })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(createTemplateShare(service, alice.id, { items: pick(hidden) })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(createTemplateShare(service, alice.id, { items: [{ type: 'series', id: randomUUID() }] })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const raw = (items: unknown) => service.rpc('template_share_create', { p_user: alice.id, p_items: items })
    expect((await raw([{ type: 'template', id: liveA }, { type: 'template', id: liveA }])).error?.message).toBe('INVALID_INPUT')
    expect((await raw([])).error?.message).toBe('INVALID_INPUT')
    expect((await raw([{ type: 'template', id: liveA, prompt: 'x' }])).error?.message).toBe('INVALID_INPUT')
    expect((await raw([{ type: 'series', id: 'not-a-uuid' }])).error?.message).toBe('TEMPLATE_NOT_FOUND')
  })

  it('allows 20 links an hour per account, then RATE_LIMITED; other accounts are not affected', async () => {
    await db.query('delete from public.template_shares where user_id = $1', [bob.id])
    await db.query(`insert into public.template_shares(id,user_id,items) select substr(md5(random()::text),1,12),$1,'[{"type":"template","id":"x"}]' from generate_series(1,20)`, [bob.id])
    await expect(createTemplateShare(service, bob.id, { items: pick(liveA) })).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    await db.query("update public.template_shares set created_at = now() - interval '2 hours' where user_id = $1", [bob.id])
    await expect(createTemplateShare(service, bob.id, { items: pick(liveA) })).resolves.toMatch(/^[a-z0-9]{12}$/)
    await db.query('delete from public.template_shares where user_id = $1', [bob.id])
  })
})

describe('RLS and grants', () => {
  it('lists the caller’s own links newest first, never another account’s', async () => {
    const older = await createTemplateShare(service, alice.id, { items: pick(liveA) })
    const newer = await createTemplateShare(service, alice.id, { items: pick(liveB) })
    await db.query("update public.template_shares set created_at = created_at - interval '1 minute' where id = $1", [older])
    const mine = (await listTemplateShares(aliceClient, alice.id)).map((share) => share.id)
    expect(mine.indexOf(newer)).toBeLessThan(mine.indexOf(older))
    expect(await listTemplateShares(bobClient, alice.id)).toEqual([])
    expect((await bobClient.from('template_shares').select('id').eq('id', newer)).data).toEqual([])
  })

  it('gives clients no writes and no function calls; anonymous visitors nothing', async () => {
    const id = await createTemplateShare(service, alice.id, { items: pick(liveA) })
    expect((await aliceClient.from('template_shares').insert({ id: 'zzzzzzzzzzzz', user_id: alice.id, items: pick(liveA) })).error?.code).toBe('42501')
    await aliceClient.from('template_shares').update({ revoked_at: new Date().toISOString() }).eq('id', id)
    await aliceClient.from('template_shares').delete().eq('id', id)
    expect(await readTemplateShare(service, id)).toMatchObject({ revokedAt: null })
    expect((await aliceClient.rpc('template_share_create', { p_user: alice.id, p_items: pick(liveA) })).error).not.toBeNull()
    expect((await aliceClient.rpc('template_share_revoke', { p_user: alice.id, p_id: id })).error).not.toBeNull()
    expect((await anonSupabase().from('template_shares').select('id')).error).not.toBeNull()
    expect((await anonSupabase().rpc('template_share_create', { p_user: alice.id, p_items: pick(liveA) })).error).not.toBeNull()
  })
})

describe('revoking', () => {
  it('is the owner’s alone, once; the row stays, marked revoked', async () => {
    const id = await createTemplateShare(service, alice.id, { items: pick(liveA) })
    expect(await revokeTemplateShare(service, bob.id, id)).toBe(false)
    expect(await readTemplateShare(service, id)).toMatchObject({ revokedAt: null })
    expect(await revokeTemplateShare(service, alice.id, id)).toBe(true)
    expect(await revokeTemplateShare(service, alice.id, id)).toBe(false)
    expect((await readTemplateShare(service, id))?.revokedAt).not.toBeNull()
    expect(await revokeTemplateShare(service, alice.id, 'not-an-id')).toBe(false)
  })

  it('goes with the account', async () => {
    const carol = await wishlistUser(db, { eligible: false })
    const id = await createTemplateShare(service, carol.id, { items: pick(liveA) })
    await db.query('delete from auth.users where id = $1', [carol.id])
    expect(await readTemplateShare(service, id)).toBeNull()
  })
})
