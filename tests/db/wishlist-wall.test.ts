import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createRequest, listMyRequests, listWall, reviewRequest, toggleVote, type Page, type WishlistDeps } from '@/core/wishlist'

import { connectAdmin } from './helpers'
import { serviceSupabase } from './supabase-env'
import { buyTier, dropTier, makeMax, requestRow, signedIn, uploadInput, wishlistDeps, wishlistUser, type WishlistUser } from './wishlist-fixtures'

// LAUNCH §9.6 items 2, 4 and 5 on the real database: RLS visibility, the weighted vote toggle
// and the shipped-first wall.

let db: Client
let deps: WishlistDeps
let memory: ReturnType<typeof wishlistDeps>['memory']
// The two accounts that read through a real session; created once, since Auth is slow.
let alice: WishlistUser
let bob: WishlistUser
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeAll(async () => {
  db = await connectAdmin()
  ;({ deps, memory } = wishlistDeps())
  alice = await wishlistUser(db, { session: true })
  bob = await wishlistUser(db, { session: true })
  aliceClient = await signedIn(alice)
  bobClient = await signedIn(bob)
}, 60_000)

afterAll(async () => {
  await db.end()
})

async function post(user: WishlistUser, description = 'Brunch poster') {
  return createRequest(deps, user.id, { description, input_keys: [await uploadInput(memory, user.id)] })
}

async function livePost(user: WishlistUser, description?: string) {
  const created = await post(user, description)
  await reviewRequest(deps, { id: created.id, action: 'approve' })
  return created
}

// Runs as a client role inside a rolled-back transaction, the way PostgREST does.
async function asUser<T>(sub: string | null, run: () => Promise<T>) {
  await db.query('begin')
  try {
    await db.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    if (sub) await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: 'authenticated' })])
    return await run()
  } finally {
    await db.query('rollback')
  }
}

// Every page of a keyset list, following nextCursor to the end.
async function walk<T>(load: (cursor: string | null) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null
  do {
    const page = await load(cursor)
    items.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return items
}

const visibleIds = (sub: string) =>
  asUser(sub, async () => (await db.query<{ id: string }>('select id from public.template_requests')).rows.map((row) => row.id))

describe('RLS visibility (§15.3)', () => {
  it('shows pending and rejected only to the author; live and shipped to everyone signed in', async () => {
    const author = alice
    const other = bob
    const pending = await post(author)
    const rejected = await post(author)
    await reviewRequest(deps, { id: rejected.id, action: 'reject' })
    const live = await livePost(author)

    const mine = await visibleIds(author.id)
    expect(mine).toEqual(expect.arrayContaining([pending.id, rejected.id, live.id]))
    const theirs = await visibleIds(other.id)
    expect(theirs).toContain(live.id)
    expect(theirs).not.toContain(pending.id)
    expect(theirs).not.toContain(rejected.id)
    const admin = await wishlistUser(db, { eligible: false })
    await db.query("update public.profiles set role = 'admin' where id = $1", [admin.id])
    expect(await visibleIds(admin.id)).toEqual(expect.arrayContaining([pending.id, rejected.id, live.id]))

    const wall = await walk((cursor) => listWall(bobClient, memory.store, cursor))
    expect(wall.map((card) => card.id)).not.toContain(pending.id)
    const my = await walk((cursor) => listMyRequests(aliceClient, memory.store, author.id, cursor))
    expect(my.map((request) => [request.id, request.status])).toEqual(
      expect.arrayContaining([[pending.id, 'pending'], [rejected.id, 'rejected'], [live.id, 'live']]),
    )
  })

  it('gives anonymous callers nothing and lets no client write', async () => {
    const author = alice
    const live = await livePost(author)
    await expect(asUser(null, () => db.query('select id from public.template_requests'))).rejects.toThrow(/permission denied/)
    await expect(
      asUser(author.id, () => db.query('update public.template_requests set votes_count = 99 where id = $1', [live.id])),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asUser(author.id, () => db.query('insert into public.template_request_votes (request_id, user_id, weight) values ($1, $2, 3)', [live.id, author.id])),
    ).rejects.toThrow(/permission denied/)
    const { error } = await aliceClient.rpc('toggle_template_request_vote', { p_request_id: live.id, p_user_id: author.id })
    expect(error).not.toBeNull()
  })

  it.each([
    'public.wishlist_eligible($1)',
    "public.create_template_request($1, 'x', array[]::text[])",
    'public.toggle_template_request_vote($1, $1)',
    "public.admin_review_template_request($1, 'live', null::text)",
  ])('keeps %s away from signed-in and anonymous clients', async (call) => {
    const author = await wishlistUser(db, { eligible: false })
    for (const sub of [author.id, null]) {
      await expect(asUser(sub, () => db.query(`select ${call}`, [author.id]))).rejects.toThrow(/permission denied/)
    }
    await expect(asUser(author.id, () => db.query('select * from public.admin_list_template_requests()'))).rejects.toThrow(
      /permission denied/,
    )
  })

  it('shows a user only their own votes', async () => {
    const author = await wishlistUser(db)
    const voter = await wishlistUser(db)
    const live = await livePost(author)
    await toggleVote(deps.db, voter.id, live.id)
    const rows = (sub: string) => asUser(sub, async () => (await db.query('select user_id from public.template_request_votes where request_id = $1', [live.id])).rows)
    expect(await rows(voter.id)).toEqual([{ user_id: voter.id }])
    expect(await rows(author.id)).toEqual([])
  })
})

const voteRows = async (requestId: string) =>
  (await db.query('select user_id, weight from public.template_request_votes where request_id = $1', [requestId])).rows

describe('vote toggle with weights (§15.1, T12 scope note)', () => {
  it('flips between 0 and 1 on five clicks, with at most one row', async () => {
    const author = await wishlistUser(db)
    const voter = await wishlistUser(db)
    const live = await livePost(author)
    const counts: number[] = []
    for (let i = 0; i < 5; i += 1) {
      counts.push((await toggleVote(deps.db, voter.id, live.id)).votesCount)
      expect((await voteRows(live.id)).length).toBeLessThanOrEqual(1)
    }
    expect(counts).toEqual([1, 0, 1, 0, 1])
  })

  it('stays consistent under five concurrent clicks', async () => {
    const author = await wishlistUser(db)
    const voter = await wishlistUser(db)
    const live = await livePost(author)
    await Promise.all(Array.from({ length: 5 }, () => toggleVote(serviceSupabase(), voter.id, live.id)))
    const rows = await voteRows(live.id)
    expect(rows).toHaveLength(1)
    expect((await requestRow(db, live.id))?.votes_count).toBe(1)
  })

  it('counts a Max vote as 3 and takes back exactly 3 even after the tier lapsed', async () => {
    const author = await wishlistUser(db)
    const max = await wishlistUser(db)
    const plain = await wishlistUser(db)
    const live = await livePost(author)
    await makeMax(max.id)

    expect(await toggleVote(deps.db, max.id, live.id)).toEqual({ voted: true, votesCount: 3 })
    expect(await toggleVote(deps.db, plain.id, live.id)).toEqual({ voted: true, votesCount: 4 })
    await dropTier(db, max.id)
    expect(await toggleVote(deps.db, max.id, live.id)).toEqual({ voted: false, votesCount: 1 })
  })

  it('counts a Pro vote as 1: only Max weighs 3', async () => {
    const author = await wishlistUser(db)
    const pro = await wishlistUser(db)
    const live = await livePost(author)
    await buyTier(pro.id, 'pro')
    expect(await toggleVote(deps.db, pro.id, live.id)).toEqual({ voted: true, votesCount: 1 })
    expect(await voteRows(live.id)).toEqual([{ user_id: pro.id, weight: 1 }])
  })

  it('reads the tier through the definer function even though clients may not call current_tier', async () => {
    const { rows } = await db.query<{ client: boolean; definer: boolean }>(
      `select has_function_privilege('authenticated', 'public.current_tier(uuid)', 'execute') as client,
              (select prosecdef from pg_proc where oid = 'public.toggle_template_request_vote(uuid, uuid)'::regprocedure) as definer`,
    )
    expect(rows[0]).toEqual({ client: false, definer: true })
  })

  it('drops a voter’s weight from the count when they delete their account', async () => {
    const author = await wishlistUser(db)
    // Through Auth, as account deletion does: the cascade then runs as Auth's own role.
    const max = await wishlistUser(db, { session: true })
    const live = await livePost(author)
    await makeMax(max.id)
    await toggleVote(deps.db, max.id, live.id)
    const { error } = await serviceSupabase().auth.admin.deleteUser(max.id)
    expect(error).toBeNull()
    expect((await requestRow(db, live.id))?.votes_count).toBe(0)
  })

  it('takes votes only on live requests', async () => {
    const author = await wishlistUser(db)
    const voter = await wishlistUser(db)
    const pending = await post(author)
    await expect(toggleVote(deps.db, voter.id, pending.id)).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(toggleVote(deps.db, voter.id, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('the wall (§15.1)', () => {
  it('puts shipped first, then live by votes, then newest, with the viewer’s vote state', async () => {
    const author = await wishlistUser(db)
    const viewer = bob
    const voters = await Promise.all([wishlistUser(db), wishlistUser(db)])
    const shipped = await livePost(author, 'shipped one')
    const popular = await livePost(author, 'popular')
    const older = await livePost(author, 'older quiet')
    const newer = await livePost(author, 'newer quiet')
    for (const voter of voters) await toggleVote(deps.db, voter.id, popular.id)
    await toggleVote(deps.db, viewer.id, older.id)
    await reviewRequest(deps, { id: shipped.id, action: 'ship', templateId: 'freeform' })

    const wall = await walk((cursor) => listWall(bobClient, memory.store, cursor))
    const ours = wall.filter((card) => [shipped.id, popular.id, older.id, newer.id].includes(card.id))
    expect(ours.map((card) => card.description)).toEqual(['shipped one', 'popular', 'older quiet', 'newer quiet'])
    // older has the viewer's vote (1) and so outranks newer (0).
    expect(ours[0]).toMatchObject({ status: 'shipped', template: { id: 'freeform' } })
    expect(ours[2]).toMatchObject({ voted: true, votesCount: 1 })
    expect(ours[3]).toMatchObject({ voted: false, authorLabel: 'T***' })
    expect(ours[1]?.imageUrls[0]).toMatch(/^memory:\/\/get\/requests\//)
    // Every shipped card on the wall sits above every live one.
    const lastShipped = wall.map((card) => card.status).lastIndexOf('shipped')
    expect(wall.slice(lastShipped + 1).every((card) => card.status === 'live')).toBe(true)
  })
})

// Rows inserted straight into the table, dated two days back so they never count towards the
// 5-per-24h posting limit. Other test files add live requests concurrently, so each check
// compares only the rows this test made.
async function seedRows(userId: string, rows: Array<{ status: string; votes: number; at: number }>) {
  const { rows: inserted } = await db.query<{ id: string }>(
    `insert into public.template_requests
       (user_id, description, image_keys, status, template_id, votes_count, author_label, created_at, reviewed_at)
     select $1::uuid, 'seeded ' || r.ord, array['requests/' || $1::text || '/' || gen_random_uuid() || '.jpg'], r.status,
            case when r.status = 'shipped' then 'freeform' end, r.votes, 'S***',
            now() - interval '2 days' - make_interval(secs => r.at), case when r.status <> 'pending' then now() end
       from unnest($2::text[], $3::int[], $4::int[]) with ordinality as r(status, votes, at, ord)
     returning id`,
    [userId, rows.map((row) => row.status), rows.map((row) => row.votes), rows.map((row) => row.at)],
  )
  return new Set(inserted.map((row) => row.id))
}

async function expectedOrder(ids: Set<string>, orderBy: string) {
  const { rows } = await db.query<{ id: string }>(`select id from public.template_requests where id = any($1) order by ${orderBy}`, [[...ids]])
  return rows.map((row) => row.id)
}

describe('keyset pages of 30 (AGENTS §5.1)', () => {
  it('walks the wall page by page: shipped first, then votes, newest, id; no repeats', async () => {
    const author = await wishlistUser(db)
    // Ties on purpose: several rows share a vote count and a timestamp, so id decides.
    const shape = Array.from({ length: 36 }, (_, n) => ({ status: n < 4 ? 'shipped' : 'live', votes: n % 3, at: Math.floor(n / 4) }))
    const ids = await seedRows(author.id, shape)
    const pages: number[] = []
    const wall = await walk(async (cursor) => {
      const page = await listWall(bobClient, memory.store, cursor)
      pages.push(page.items.length)
      return page
    })
    expect(pages.every((size) => size <= 30)).toBe(true)
    expect(new Set(wall.map((card) => card.id)).size).toBe(wall.length)
    const walked = wall.map((card) => card.id).filter((id) => ids.has(id))
    expect(walked).toEqual(await expectedOrder(ids, "(status = 'shipped') desc, votes_count desc, created_at desc, id desc"))
  })

  it('walks My requests newest first with id as the tie-breaker', async () => {
    const ids = await seedRows(alice.id, Array.from({ length: 33 }, (_, n) => ({ status: 'pending', votes: 0, at: Math.floor(n / 3) })))
    const mine = await walk((cursor) => listMyRequests(aliceClient, memory.store, alice.id, cursor))
    expect(new Set(mine.map((request) => request.id)).size).toBe(mine.length)
    expect(mine.map((request) => request.id).filter((id) => ids.has(id))).toEqual(await expectedOrder(ids, 'created_at desc, id desc'))
  })
})
