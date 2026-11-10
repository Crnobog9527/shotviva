import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { cleanupOnOpen, listManagedAssets, removeAssets } from '@/modules/image'
import { createMemoryStore } from '../fakes/memory-store'
import { connectAdmin, createUser } from './helpers'
import { holdTestBudget } from './test-run-fixtures'
import { anonSupabase, serviceSupabase } from './supabase-env'

let pg: Client
let actor: string
let releaseBudget: () => Promise<void>
const deps = { db: serviceSupabase(), store: createMemoryStore().store }
const template = 'freeform'
const photoKey = (id: string) => `admin-tests/photos/${id}.png`
const runKey = (id: string) => `admin-tests/outputs/${id}.png`
const remove = (kind: 'run' | 'photo', ids: string[], expected?: number) => removeAssets(deps, actor, { kind, ids, expected })

beforeAll(async () => {
  pg = await connectAdmin()
  releaseBudget = await holdTestBudget(pg)
  actor = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [actor])
}, 120_000)
afterAll(async () => { await releaseBudget(); await pg.end() })

async function photo() {
  const id = randomUUID()
  await pg.query('insert into public.admin_test_photos(id,object_key) values($1,$2)', [id, photoKey(id)])
  await deps.store.put(photoKey(id), new Uint8Array(3), 'image/png')
  await deps.store.put(photoKey(id) + '.thumb.webp', new Uint8Array(1), 'image/webp')
  return id
}

async function run(photoId: string, status = 'succeeded') {
  const id = randomUUID()
  await pg.query(`insert into public.admin_test_runs(id,template_id,kind,batch_id,status,resolution,estimate_usd,photo_id,output_key)
    values ($1,$2,'generate',$1,$3,'1k',1,$4,$5)`, [id, template, status, photoId, runKey(id)])
  await deps.store.put(runKey(id), new Uint8Array(3), 'image/png')
  await deps.store.put(runKey(id) + '.thumb.webp', new Uint8Array(1), 'image/webp')
  return id
}

it('requires fresh reference confirmation, preserves the records and removes both photo files', async () => {
  const photos = [await photo(), await photo()]
  const first = await run(photos[0]!)
  expect(await remove('photo', photos)).toMatchObject({ count: 2, uses: 1 })
  const second = await run(photos[1]!)
  await expect(remove('photo', photos, 1)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect(await remove('photo', photos, 2)).toEqual({ count: 2, uses: 2, pending: 0 })
  const { rows } = await pg.query('select photo_id,photo_deleted from public.admin_test_runs where id=any($1)', [[first, second]])
  expect(rows).toEqual(Array(2).fill({ photo_id: null, photo_deleted: true }))
  for (const id of photos) {
    expect(await deps.store.head(photoKey(id))).toBeNull()
    expect(await deps.store.head(photoKey(id) + '.thumb.webp')).toBeNull()
  }
  await remove('run', [first, second], 0)
})

it('waits for a concurrent run to start and refuses the entire photo batch until it finishes', async () => {
  const photos = [await photo(), await photo()]
  expect(await remove('photo', photos)).toMatchObject({ count: 2, uses: 0 })
  const confirmation = await connectAdmin()
  let runId: string
  try {
    const { rows: [session] } = await confirmation.query('select pg_backend_pid() as pid')
    await pg.query('begin')
    runId = await run(photos[1]!, 'running')
    const result = confirmation.query('select public.admin_remove_test_assets($1,$2,$3,$4)', [actor, 'photo', photos, 0])
      .then(() => 'deleted', (error: Error) => error.message)
    await vi.waitFor(async () => {
      const { rows: [lock] } = await pg.query('select pg_backend_pid()=any(pg_blocking_pids($1)) as waiting', [session.pid])
      expect(lock.waiting).toBe(true)
    }, { timeout: 3_000 })
    await pg.query('commit')
    expect(await result).toBe('PHOTO_IN_RUNNING_TEST')
  } finally {
    await pg.query('rollback')
    await confirmation.end()
  }

  const expected = { code: 'INVALID_INPUT', message: '所选照片正用于试跑，请等试跑结束后再删除' }
  await expect(remove('photo', photos)).rejects.toMatchObject(expected)
  await expect(remove('photo', photos, 1)).rejects.toMatchObject(expected)
  for (const id of photos) {
    expect(await deps.store.head(photoKey(id))).not.toBeNull()
    expect(await deps.store.head(photoKey(id) + '.thumb.webp')).not.toBeNull()
  }
  await pg.query("update public.admin_test_runs set status='succeeded' where id=$1", [runId])
  expect(await remove('photo', photos, 1)).toEqual({ count: 2, uses: 1, pending: 0 })
  await remove('run', [runId], 0)
}, 15_000)

it('protects running jobs, requires cover confirmation, and preserves spend on removal', async () => {
  const src = await photo()
  const first = await run(src)
  const second = await run(src, 'running')
  await pg.query('update public.admin_test_runs set cover_set_at=now() where id=$1', [first])
  await pg.query('insert into public.admin_test_spend(run_id,template_id,estimate_usd,counted_usd) values($1,$2,1,0.3)', [first, template])
  await expect(remove('run', [first, second], 1)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect(await remove('run', [first])).toMatchObject({ count: 1, uses: 1 })
  await expect(remove('run', [first], 0)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect(await remove('run', [first], 1)).toMatchObject({ count: 1, pending: 0 })
  expect(await deps.store.head(runKey(first))).toBeNull()
  expect(await deps.store.head(runKey(first) + '.thumb.webp')).toBeNull()
  expect((await pg.query('select counted_usd::float8 as cost from public.admin_test_spend where run_id=$1', [first])).rows).toEqual([{ cost: 0.3 }])
  await pg.query('delete from public.admin_test_spend where run_id=$1', [first])
  await pg.query('delete from public.admin_test_runs where id=$1', [second])
  await remove('photo', [src], 0)
})

it('rejects ordinary users and keeps a failed storage cleanup queued for retry', async () => {
  const id = await photo()
  const body = { kind: 'photo', ids: [id], expected: 0 }
  const guest = await createUser(pg)
  await expect(removeAssets(deps, guest, body)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  expect((await anonSupabase().rpc('admin_remove_test_assets', { p_actor: actor, p_kind: 'photo', p_ids: [id], p_expected: 0 })).error).toBeTruthy()
  const unavailable = { ...deps.store, delete: async () => { throw new Error('offline') } }
  expect(await removeAssets({ ...deps, store: unavailable }, actor, body)).toMatchObject({ pending: 1 })
  const { rows } = await pg.query('select object_key from public.admin_test_asset_removals where object_key=$1', [photoKey(id)])
  expect(rows).toEqual([{ object_key: photoKey(id) }])
  await cleanupOnOpen(deps, actor)
  expect(await deps.store.head(photoKey(id))).toBeNull()
  expect((await pg.query('select 1 from public.admin_test_asset_removals where object_key=$1', [photoKey(id)])).rowCount).toBe(0)
})


it('paginates photos sharing a timestamp without skipping or repeating IDs', async () => {
  const ids = Array.from({ length: 31 }, () => randomUUID()).sort().reverse()
  await pg.query(`insert into public.admin_test_photos(id,object_key,last_used_at)
    select id, 'admin-tests/photos/' || id || '.png', now() + interval '1 day' from unnest($1::uuid[]) id`, [ids])
  const first = await listManagedAssets(deps.db, deps.store, { kind: 'photo' })
  expect(first.items.map(item => item.id)).toEqual(ids.slice(0, 30))
  const second = await listManagedAssets(deps.db, deps.store, { kind: 'photo', ...first.next })
  expect(second.items[0]?.id).toBe(ids[30])
  await remove('photo', ids, 0)
})
