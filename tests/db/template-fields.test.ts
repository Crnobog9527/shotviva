import { publishFixture } from './helpers'
import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runGeneration, type GenerationRequest } from '@/core/jobs'
import { newInputKey } from '@/core/storage'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

// ARCHITECTURE §5.1d: admin-defined text fields reach the prompt (a {{key}} in the body, or a
// "Label: value" line after it), and the job records which fields were public when it was made,
// so making a field public later never exposes older text. Fake prompt text only.

let db: Client
let templateId: string

async function seedTemplate(): Promise<string> {
  const id = `fields-${randomUUID().slice(0, 8)}`
  const fields = {
    images: { min: 0, max: 1 },
    aspectRatios: ['4:5', '1:1'],
    copy: [
      { key: 'headline', label: 'Headline', type: 'short', required: true, maxLength: 60, public: true },
      { key: 'size', label: 'Size', type: 'select', options: ['Small', 'Large'], required: false, maxLength: 60, public: false },
      { key: 'guests', label: 'Number of guests', type: 'number', min: 1, max: 20, required: false, maxLength: 4 },
    ],
  }
  await db.query(
    `insert into public.templates (id, name, category, fields, quality, credits_cost, is_active, visible_in)
     values ($1, 'Fields test', 'pets', $2, 'medium', '{"1k": 1, "2k": 2, "3k": 3}', false, '{web}')`,
    [id, JSON.stringify(fields)],
  )
  await db.query('insert into public.template_prompts (template_id, body, model_params) values ($1, $2, $3)', [id, 'WRAPPED poster "{{headline}}".', '{}'])
  await publishFixture(db, id)
  return id
}

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate()
})

afterAll(async () => {
  await db.end()
})

async function setup() {
  const userId = await createUser(db, { credits: 5 })
  const r2 = createMemoryStore()
  const inputKey = newInputKey(userId, 'image/jpeg')
  r2.upload(inputKey, await jpeg(1600, 1200), 'image/jpeg')
  const fake = fakeProvider()
  const deps = { db: serviceSupabase(), store: r2.store, provider: fake.provider, providerTimeoutMs: 200 }
  const request = (overrides: Partial<GenerationRequest> = {}): GenerationRequest => ({ userId, source: 'web', templateId, inputKey, ...overrides })
  return { userId, fake, deps, request }
}

describe('admin-defined template fields (§5.1d)', () => {
  it('fills the placeholder, adds the other fields as labelled lines, and snapshots the public keys', async () => {
    const { fake, deps, request } = await setup()
    const view = await runGeneration(deps, request({ copy: { headline: ' Grand\nOpening ', size: 'Large', guests: '4' } }))
    expect(fake.calls[0]?.prompt).toBe('WRAPPED poster "Grand Opening".\n\nSize: Large\nNumber of guests: 4')
    const { rows } = await db.query<{ inputs: Record<string, unknown> }>('select inputs from public.generation_jobs where id = $1', [view.id])
    expect(rows[0]?.inputs).toMatchObject({ copy: { headline: 'Grand Opening', size: 'Large', guests: '4' }, copy_public: ['headline'] })
  })

  it('refuses a choice or number outside the definition before anything is charged', async () => {
    const { userId, deps, request } = await setup()
    await expect(runGeneration(deps, request({ copy: { headline: 'Hi', size: 'Huge' } }))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(runGeneration(deps, request({ copy: { headline: 'Hi', guests: '50' } }))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const { rows } = await db.query<{ n: string }>('select count(*) as n from public.generation_jobs where user_id = $1', [userId])
    expect(Number(rows[0]?.n)).toBe(0)
  })
})
