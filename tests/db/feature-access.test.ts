import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listFeatureSettings, saveFeatureAccess } from '@/core/admin'
import { loadFeatureAccess } from '@/core/features'

import { anonClient, connectAdmin, createUser, serviceClient } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// T29: feature_access and admin_set_feature_access (ARCHITECTURE §6.2 新功能抢先用), through the
// same command the admin page calls. Keys are unique per run: the table is global.

let db: Client
let admin: string
const service = serviceSupabase()
const key = () => `t29_${randomUUID().replaceAll('-', '').slice(0, 12)}`

beforeAll(async () => {
  db = await connectAdmin()
  admin = await createUser(db)
})

afterAll(async () => {
  await db.query(`delete from public.feature_access where key like 't29_%'`)
  await db.end()
})

const rowOf = async (k: string) =>
  (await db.query('select min_tier, open_to_all_at, updated_by from public.feature_access where key = $1', [k])).rows[0]

describe('admin_set_feature_access', () => {
  it('inserts, then updates the same row, recording who saved it', async () => {
    const k = key()
    const registry = [{ key: k, name: '测试功能' }]
    const run = (input: Record<string, unknown>, actor: string) =>
      saveFeatureAccess({ db: service, invalidate: () => undefined, registry }, actor, { key: k, ...input })

    await run({ minTier: 'max', openToAllAt: '2026-12-01T00:00:00Z' }, admin)
    expect(await rowOf(k)).toMatchObject({ min_tier: 'max', updated_by: admin })
    expect((await rowOf(k)).open_to_all_at.toISOString()).toBe('2026-12-01T00:00:00.000Z')

    const other = await createUser(db)
    await run({ minTier: null, openToAllAt: null }, other)
    expect(await rowOf(k)).toMatchObject({ min_tier: null, open_to_all_at: null, updated_by: other })
    expect((await db.query('select count(*)::int as n from public.feature_access where key = $1', [k])).rows[0].n).toBe(1)

    const [listed] = await listFeatureSettings(service, registry)
    expect(listed).toEqual({ key: k, name: '测试功能', minTier: null, openToAllAt: null })
  })

  it('refuses a tier outside pro / max and a missing actor', async () => {
    const args = { p_key: key(), p_min_tier: 'starter', p_open_to_all_at: null, p_actor: admin }
    expect((await serviceClient().rpc('admin_set_feature_access', args)).error?.message).toBe('INVALID_INPUT')
    const noActor = { ...args, p_min_tier: 'pro', p_actor: null }
    expect((await serviceClient().rpc('admin_set_feature_access', noActor)).error?.message).toBe('INVALID_INPUT')
  })

  it('reads back through loadFeatureAccess as the gate rows', async () => {
    const k = key()
    const { error } = await service.rpc('admin_set_feature_access', { p_key: k, p_min_tier: 'pro', p_open_to_all_at: null, p_actor: admin })
    expect(error).toBeNull()
    expect((await loadFeatureAccess(service)).find((row) => row.key === k)).toEqual({ key: k, minTier: 'pro', openToAllAt: null })
  })
})

describe('feature_access privacy', () => {
  it('no client role can read the table or call the function', async () => {
    const { data, error } = await anonSupabase().from('feature_access').select('key')
    expect(error ?? data).toBeTruthy()
    expect(data ?? []).toEqual([])
    const { error: rpcError } = await anonClient().rpc('admin_set_feature_access', {
      p_key: key(),
      p_min_tier: 'max',
      p_open_to_all_at: null,
      p_actor: admin,
    })
    expect(rpcError).not.toBeNull()
  })

  it('has RLS on with no policy', async () => {
    const { rows } = await db.query(
      `select c.relrowsecurity as rls, (select count(*)::int from pg_policies p where p.tablename = 'feature_access') as policies
         from pg_class c where c.oid = 'public.feature_access'::regclass`,
    )
    expect(rows[0]).toEqual({ rls: true, policies: 0 })
  })
})
