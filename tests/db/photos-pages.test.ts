import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listOwnJobs, PHOTOS_PAGE, type OwnJobsCursor } from '@/core/jobs'

import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

// Photos pages back through every finished work (2026-11-27: the list stopped at the newest 60).
// Keyset on (created_at, id) desc: following "Load more" from the first page reaches the oldest
// work once each, rows sharing one created_at (to the microsecond) are not skipped, and someone
// else's works never appear.

let db: Client
const service = serviceSupabase()

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

async function seed(userId: string, createdAt: string, status: 'succeeded' | 'failed' = 'succeeded', batchId: string | null = null): Promise<string> {
  const id = randomUUID()
  await db.query(
    `insert into public.generation_jobs
       (id, user_id, module, template_id, inputs, provider, source, status, visibility, credits_cost, credit_pool,
        output_key, error_code, created_at, finished_at, batch_id)
     values ($1, $2, 'image', 'freeform', $8, 'test/model', 'web', $3, 'private', 2, 'paid', $4, $5, $6, $6, $7)`,
    [id, userId, status, status === 'succeeded' ? 'outputs/x.png' : null, status === 'failed' ? 'PROVIDER_FAILED' : null, createdAt, batchId, JSON.stringify({ resolution: '1k', ...(batchId ? { batch_id: batchId } : {}) })],
  )
  return id
}

describe('Photos pages (listOwnJobs with a cursor)', () => {
  it('walks every finished work once, newest first, with ties on created_at kept', async () => {
    const userId = await createUser(db)
    const other = await createUser(db)
    const start = Date.UTC(2026, 5, 1)
    const made: string[] = []
    for (let i = 0; i < PHOTOS_PAGE * 2 + 5; i++) {
      // Three works share every fifth timestamp, with microseconds a JS Date cannot hold.
      const at = new Date(start + Math.floor(i / 3) * 60_000).toISOString().replace('Z', '123+00:00')
      made.push(await seed(userId, at))
    }
    await seed(userId, new Date(start + 3_600_000).toISOString(), 'failed')
    await seed(other, new Date(start).toISOString())

    const seen: string[] = []
    let until: OwnJobsCursor | null = null
    let pages = 0
    let total = 0
    do {
      const page = await listOwnJobs(service, userId, new Date(), until)
      total = page.total
      // Each page lists everything down to the cursor plus one page more.
      expect(page.done.slice(0, seen.length).map((job) => job.id)).toEqual(seen)
      seen.splice(0, seen.length, ...page.done.map((job) => job.id))
      until = page.next
      pages++
    } while (until && pages < 10)

    expect(pages).toBe(3)
    expect(total).toBe(made.length)
    expect(new Set(seen).size).toBe(seen.length)
    expect(new Set(seen)).toEqual(new Set(made))
  })

  it('reads a batch cut by the page in whole, and the next page does not list it twice', async () => {
    const userId = await createUser(db)
    const start = Date.UTC(2026, 6, 1)
    const batchId = randomUUID()
    for (let i = 0; i < PHOTOS_PAGE + 10; i++) {
      // The batch straddles the end of the first page.
      const inBatch = i >= PHOTOS_PAGE - 2 && i < PHOTOS_PAGE + 2
      await seed(userId, new Date(start - i * 60_000).toISOString(), 'succeeded', inBatch ? batchId : null)
    }
    const first = await listOwnJobs(service, userId, new Date())
    expect(first.done.filter((job) => job.batchId === batchId)).toHaveLength(4)
    expect(first.next).not.toBeNull()
    const second = await listOwnJobs(service, userId, new Date(), first.next)
    const ids = second.done.map((job) => job.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(PHOTOS_PAGE + 10)
    expect(second.next).toBeNull()
  })

  it('slides past the window above the cursor and still reaches the oldest work, each once', async () => {
    const userId = await createUser(db)
    const start = Date.UTC(2026, 7, 1)
    const made: string[] = []
    for (let i = 0; i < PHOTOS_PAGE * 4 + 3; i++) made.push(await seed(userId, new Date(start - i * 60_000).toISOString()))
    const window = PHOTOS_PAGE + 5
    const order: string[] = []
    let until: OwnJobsCursor | null = null
    let pages = 0
    do {
      const page = await listOwnJobs(service, userId, new Date(), until, window)
      const ids = page.done.map((job) => job.id)
      expect(ids.length).toBeLessThanOrEqual(window + PHOTOS_PAGE)
      // What this page adds below the cursor joins on with no gap or repeat.
      const added = until ? ids.slice(ids.indexOf(until.id) + 1) : ids
      expect(until === null || ids.includes(until.id)).toBe(true)
      order.push(...added)
      until = page.next
      pages++
    } while (until && pages < 10)
    expect(pages).toBe(5)
    expect(order).toEqual(made)
  })
})
