import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectAdmin, createPricedTemplate, createUser } from './helpers'

// generation_jobs.again_of (1512) and its insert trigger (1513), ARCHITECTURE §16.2c: Make again
// is recorded only for the caller's own succeeded, undeleted work with the same template; any
// other claim is dropped without failing the job, and the key never stays in inputs. Runs in one
// transaction that is rolled back.

let db: Client
let owner: string
let other: string
let template: string
let otherTemplate: string
let source: string

async function insertJob(userId: string, opts: { template?: string; againOf?: unknown; status?: 'succeeded' | 'failed'; column?: string } = {}) {
  const id = randomUUID()
  const ok = (opts.status ?? 'succeeded') === 'succeeded'
  const inputs = { resolution: '1k', ...(opts.againOf !== undefined ? { again_of: opts.againOf } : {}) }
  const { rows } = await db.query<{ again_of: string | null; inputs: Record<string, unknown> }>(
    `insert into public.generation_jobs
       (id, user_id, module, template_id, inputs, provider, source, status, visibility, credits_cost, credit_pool,
        output_key, error_code, finished_at, again_of)
     values ($1, $2, 'image', $3, $4, 'test/model', 'web', $5, 'public', 2, 'free', $6, $7, now(), $8)
     returning again_of, inputs`,
    [id, userId, opts.template ?? template, JSON.stringify(inputs), ok ? 'succeeded' : 'failed', ok ? 'outputs/x.png' : null, ok ? null : 'PROVIDER_FAILED', opts.column ?? null],
  )
  return { id, ...rows[0]! }
}

beforeAll(async () => {
  db = await connectAdmin()
  await db.query('begin')
  owner = await createUser(db)
  other = await createUser(db)
  template = await createPricedTemplate(db)
  otherTemplate = await createPricedTemplate(db)
  source = (await insertJob(owner)).id
}, 60_000)

afterAll(async () => {
  await db.query('rollback')
  await db.end()
})

describe('again_of', () => {
  it('records Make again of the caller\'s own succeeded work and takes the key out of inputs', async () => {
    const job = await insertJob(owner, { againOf: source })
    expect(job.again_of).toBe(source)
    expect(job.inputs).not.toHaveProperty('again_of')
  })

  it('drops a claim on someone else\'s work', async () => {
    expect((await insertJob(other, { againOf: source })).again_of).toBeNull()
  })

  it('drops a claim with another template, a failed or deleted source, or a malformed id', async () => {
    expect((await insertJob(owner, { againOf: source, template: otherTemplate })).again_of).toBeNull()
    const failed = await insertJob(owner, { status: 'failed' })
    expect((await insertJob(owner, { againOf: failed.id })).again_of).toBeNull()
    const deleted = await insertJob(owner)
    await db.query('update public.generation_jobs set deleted_at = now() where id = $1', [deleted.id])
    expect((await insertJob(owner, { againOf: deleted.id })).again_of).toBeNull()
    const malformed = await insertJob(owner, { againOf: 'not-a-uuid' })
    expect(malformed.again_of).toBeNull()
    expect(malformed.inputs).not.toHaveProperty('again_of')
  })

  it('ignores a value written straight into the column', async () => {
    expect((await insertJob(owner, { column: source })).again_of).toBeNull()
  })

  it('is set null when the source work is deleted', async () => {
    const own = await insertJob(owner)
    const again = await insertJob(owner, { againOf: own.id })
    await db.query('delete from public.generation_jobs where id = $1', [own.id])
    const { rows } = await db.query<{ again_of: string | null }>('select again_of from public.generation_jobs where id = $1', [again.id])
    expect(rows[0]!.again_of).toBeNull()
  })
})
