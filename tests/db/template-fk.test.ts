import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectAdmin, createUser } from './helpers'

describe('generation_jobs.template_id foreign key', () => {
  let db: Client
  let userId: string

  beforeAll(async () => {
    db = await connectAdmin()
    userId = await createUser(db, { credits: 5 })
  })

  afterAll(async () => {
    await db.query('delete from auth.users where id = $1', [userId])
    await db.end()
  })

  const reserve = (templateId: string) =>
    db.query("select public.reserve_credits(gen_random_uuid(), $1, 'image', $2, 1, 'web')", [userId, templateId])

  // reserve_credits looks the price up first (T16), so an unknown template stops there; the
  // foreign key still backs it for any other insert path.
  it('rejects jobs for unknown templates', async () => {
    await expect(reserve('no-such-template')).rejects.toThrow(/TEMPLATE_NOT_FOUND/)
    await expect(
      db.query(
        `insert into public.generation_jobs (id, user_id, module, template_id, source, credit_pool, visibility, credits_cost)
         values (gen_random_uuid(), $1, 'image', 'no-such-template', 'web', 'paid', 'private', 1)`,
        [userId],
      ),
    ).rejects.toThrow(/foreign key/)
  })

  it('accepts jobs for existing templates and blocks deleting them', async () => {
    await reserve('freeform')
    await expect(db.query("delete from public.templates where id = 'freeform'")).rejects.toThrow(/foreign key/)
  })
})
