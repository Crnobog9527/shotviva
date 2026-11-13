import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { saveProvider } from '@/core/admin'

import { connectAdmin, createUser } from './helpers'
import { publicHost } from './provider-fixtures'
import { serviceSupabase } from './supabase-env'

// PR-1b, migration 1370: OpenAI tiers come from the model table; an admin narrows them or, for a
// model the table does not know, declares more, and the declaration is audited with the save.

const PREFIX = 'PR1b tiers'
const KEY = 'sk-pr1b-tiers-secret-0123456789'

let pg: Client
let adminId: string

const deps = () => ({ db: serviceSupabase(), resolveHost: publicHost })
const save = (input: Record<string, unknown>) =>
  saveProvider(deps(), adminId, {
    label: `${PREFIX} ${randomUUID().slice(0, 6)}`,
    module: 'image',
    adapter: 'openai_images',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: KEY,
    priceInputTextPerM: 5, priceInputImagePerM: 8, priceOutputPerM: 30,
    ...input,
  })

// Raw database names: the top tier is still stored as 3k until the contract migration.
const row = async (id: string) =>
  (await pg.query("select resolutions, capabilities->>'resolutionSource' as source, capabilities->'resolutionLimit' as lim from public.ai_providers where id = $1", [id])).rows[0]
const audits = async (id: string) =>
  (await pg.query("select reason, user_id from public.admin_audit_log where action = 'provider_declare_tiers' and target_id = $1", [id])).rows

beforeAll(async () => {
  pg = await connectAdmin()
  adminId = await createUser(pg)
  await pg.query("update public.profiles set role = 'admin' where id = $1", [adminId])
})

afterAll(async () => {
  const ids = (await pg.query('select id::text from public.ai_providers where label like $1', [`${PREFIX}%`])).rows.map((r) => r.id)
  await pg.query("delete from public.admin_audit_log where action = 'provider_declare_tiers' and target_id = any($1)", [ids])
  await pg.query('delete from public.ai_providers where label like $1', [`${PREFIX}%`])
  await pg.end()
})

describe('OpenAI tiers by model (PR-1b)', () => {
  it('opens all three tiers for a known model, with no audit', async () => {
    const id = await save({ model: 'gpt-image-2.6', resolutions: ['1k', '2k', '4k'] })
    expect(await row(id)).toEqual({ resolutions: ['1k', '2k', '3k'], source: 'spec', lim: null })
    expect(await audits(id)).toEqual([])
  })

  it('keeps an admin\'s narrower choice and still writes no audit', async () => {
    const id = await save({ model: 'gpt-image-2.6', resolutions: ['1k', '2k'] })
    expect(await row(id)).toEqual({ resolutions: ['1k', '2k'], source: 'spec', lim: ['1k', '2k'] })
    expect(await audits(id)).toEqual([])
  })

  it('opens 1K only for an unknown model unless tiers are declared', async () => {
    const id = await save({ model: 'gpt-image-9-test' })
    expect(await row(id)).toEqual({ resolutions: ['1k'], source: 'unknown', lim: null })
    expect(await audits(id)).toEqual([])
  })

  it('audits a declaration for an unknown model in the same save', async () => {
    const id = await save({ model: 'gpt-image-9-test', resolutions: ['1k', '4k'] })
    expect(await row(id)).toEqual({ resolutions: ['1k', '3k'], source: 'declared', lim: ['1k', '3k'] })
    expect(await audits(id)).toEqual([{ reason: 'gpt-image-9-test: declared 4K beyond the model table', user_id: adminId }])
  })

  it('refuses a declaration from a non-admin without saving or auditing anything', async () => {
    const other = await createUser(pg)
    const before = (await pg.query("select count(*)::int as n from public.admin_audit_log where action = 'provider_declare_tiers'")).rows[0].n
    await expect(saveProvider(deps(), other, {
      label: `${PREFIX} intruder`, module: 'image', adapter: 'openai_images', baseUrl: 'https://api.openai.com/v1',
      apiKey: KEY, model: 'gpt-image-9-test', resolutions: ['1k', '4k'], priceInputTextPerM: 5, priceInputImagePerM: 8, priceOutputPerM: 30,
    })).rejects.toThrow()
    expect((await pg.query("select count(*)::int as n from public.admin_audit_log where action = 'provider_declare_tiers'")).rows[0].n).toBe(before)
  })
})
