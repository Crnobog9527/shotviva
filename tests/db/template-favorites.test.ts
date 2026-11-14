import { publishFixture } from './helpers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FAVORITES_MAX, listFavoriteIds, setFavorite } from '@/core/favorites'

import { connectAdmin, createPricedTemplate, createUser } from './helpers'
import { anonSupabase } from './supabase-env'
import { signedIn, wishlistUser, type WishlistUser } from './wishlist-fixtures'

// T83 (ARCHITECTURE §5.1b) on the real database, through real sessions: each account reads and
// writes only its own saved templates, at most 200, hidden while the template is unpublished or
// partner-only and back once republished; deleting the template or the account removes them.

let db: Client
let alice: WishlistUser
let bob: WishlistUser
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeAll(async () => {
  db = await connectAdmin()
  alice = await wishlistUser(db, { session: true, eligible: false })
  bob = await wishlistUser(db, { session: true, eligible: false })
  aliceClient = await signedIn(alice)
  bobClient = await signedIn(bob)
}, 60_000)

afterAll(async () => {
  await db.end()
})

const rowsOf = async (userId: string) =>
  (await db.query<{ template_id: string }>('select template_id from public.template_favorites where user_id = $1', [userId])).rows.map((row) => row.template_id)

async function clear(userId: string) {
  await db.query('delete from public.template_favorites where user_id = $1', [userId])
}

describe('saving and reading (§5.1b)', () => {
  it('lists the caller’s live favorites newest first; a repeated save or removal is a no-op', async () => {
    await clear(alice.id)
    const [first, second] = [await createPricedTemplate(db), await createPricedTemplate(db)]
    expect(await setFavorite(aliceClient, alice.id, first, true)).toEqual({ saved: true })
    expect(await setFavorite(aliceClient, alice.id, second, true)).toEqual({ saved: true })
    await setFavorite(aliceClient, alice.id, first, true)
    expect(await listFavoriteIds(aliceClient, alice.id)).toEqual([second, first])
    await setFavorite(aliceClient, alice.id, second, false)
    await setFavorite(aliceClient, alice.id, second, false)
    expect(await listFavoriteIds(aliceClient, alice.id)).toEqual([first])
  })

  it('refuses a template that is not live on the web', async () => {
    const draft = await createPricedTemplate(db)
    await db.query('update public.templates set is_active = false where id = $1', [draft])
    await expect(setFavorite(aliceClient, alice.id, draft, true)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(setFavorite(aliceClient, alice.id, 'no-such-template', true)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('RLS: own rows only', () => {
  it('never shows, adds or removes another account’s favorites', async () => {
    await clear(alice.id)
    await clear(bob.id)
    const template = await createPricedTemplate(db)
    await setFavorite(aliceClient, alice.id, template, true)

    expect(await listFavoriteIds(bobClient, alice.id)).toEqual([])
    const read = await bobClient.from('template_favorites').select('template_id').eq('user_id', alice.id)
    expect(read.data).toEqual([])

    const insert = await bobClient.from('template_favorites').insert({ user_id: alice.id, template_id: template })
    expect(insert.error?.code).toBe('42501')

    await setFavorite(bobClient, alice.id, template, false)
    expect(await rowsOf(alice.id)).toEqual([template])
  })

  it('gives anonymous visitors nothing', async () => {
    const read = await anonSupabase().from('template_favorites').select('template_id')
    expect(read.error).not.toBeNull()
  })
})

describe('hidden while not live, back when republished', () => {
  it('drops unpublished and partner-only templates from the list but keeps the rows', async () => {
    await clear(alice.id)
    const [kept, unpublished, partnerOnly] = [await createPricedTemplate(db), await createPricedTemplate(db), await createPricedTemplate(db)]
    for (const id of [kept, unpublished, partnerOnly]) await setFavorite(aliceClient, alice.id, id, true)

    await db.query('update public.templates set is_active = false where id = $1', [unpublished])
    await db.query("update public.templates set visible_in = array['partner'] where id = $1", [partnerOnly])
    expect(await listFavoriteIds(aliceClient, alice.id)).toEqual([kept])
    expect((await rowsOf(alice.id)).sort()).toEqual([kept, unpublished, partnerOnly].sort())

    await db.query('update public.templates set is_active = true where id = $1', [unpublished])
    await db.query("update public.templates set visible_in = array['web', 'partner'] where id = $1", [partnerOnly])
    expect(await listFavoriteIds(aliceClient, alice.id)).toEqual([partnerOnly, unpublished, kept])
  })
})

describe('the cap', () => {
  it(`stops at ${FAVORITES_MAX}, still lets a saved one be saved again, and frees a slot on removal`, async () => {
    await clear(bob.id)
    const templates = (
      await db.query<{ id: string }>(
        `insert into public.templates (id, name, category, fields, quality, credits_cost, is_active, visible_in)
         select 't83-cap-' || substr(md5(random()::text), 1, 12), 'T83 cap', t.category, t.fields, t.quality, t.credits_cost, false, array['web']
           from public.templates t, generate_series(1, $1) where t.id = $2
         returning id`,
        [FAVORITES_MAX + 1, await createPricedTemplate(db)],
      )
    ).rows.map((row) => row.id)
    await publishFixture(db, ...templates)
    await db.query(
      `insert into public.template_favorites (user_id, template_id) select $1, unnest($2::text[])`,
      [bob.id, templates.slice(0, FAVORITES_MAX)],
    )
    const extra = templates[FAVORITES_MAX] as string
    await expect(setFavorite(bobClient, bob.id, extra, true)).rejects.toMatchObject({ code: 'FAVORITES_LIMIT' })
    await expect(setFavorite(bobClient, bob.id, templates[0] as string, true)).resolves.toEqual({ saved: true })
    await setFavorite(bobClient, bob.id, templates[0] as string, false)
    await expect(setFavorite(bobClient, bob.id, extra, true)).resolves.toEqual({ saved: true })
    expect(await rowsOf(bob.id)).toHaveLength(FAVORITES_MAX)
    await clear(bob.id)
  })
})

describe('cascades', () => {
  it('removes favorites with the template and with the account', async () => {
    const userId = await createUser(db)
    const [gone, other] = [await createPricedTemplate(db), await createPricedTemplate(db)]
    await db.query('insert into public.template_favorites (user_id, template_id) values ($1, $2), ($1, $3)', [userId, gone, other])

    await db.query('delete from public.templates where id = $1', [gone])
    expect(await rowsOf(userId)).toEqual([other])

    await db.query('delete from auth.users where id = $1', [userId])
    expect(await rowsOf(userId)).toEqual([])
  })
})
