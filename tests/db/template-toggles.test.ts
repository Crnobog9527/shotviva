import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runGeneration, type GenerationRequest } from '@/core/jobs'
import { handleGenerate } from '@/core/partner'
import { newInputKey } from '@/core/storage'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider } from './generation-fixtures'
import { connectAdmin, createUser, profileOf } from './helpers'
import { linkedUser, partnerRequest, routeDeps } from './partner-fixtures'
import { serviceSupabase } from './supabase-env'

// T89: a template toggle renders its private "off" fragment by default and its "on" one only
// after the user's confirmation, which the job records with the server's time; the partner API
// never turns one on. Fake fragments only (no prompt text in the repo).

const CONFIRM = { title: 'Sure?', body: 'The photo may differ.', checkbox: 'I understand', accept: 'Turn on' }
const NOW = new Date('2026-11-08T12:00:00.000Z')

let db: Client
let templateId: string

async function seedToggledTemplate(): Promise<string> {
  const id = `t89-${randomUUID().slice(0, 8)}`
  const fields = {
    images: { min: 0, max: 1 },
    copy: [],
    aspectRatios: ['4:5', '1:1'],
    toggles: [{ key: 'replate', label: 'Upgrade plating', default: false, confirm: CONFIRM }],
  }
  await db.query(
    `insert into public.templates (id, name, category, fields, quality, credits_cost, is_active, visible_in)
     values ($1, 'T89 test', 'pets', $2, 'medium', '{"1k": 1, "2k": 2, "3k": 3}', true, '{web,partner}')`,
    [id, JSON.stringify(fields)],
  )
  await db.query('insert into public.template_prompts (template_id, body, model_params) values ($1, $2, $3)', [
    id,
    'WRAPPED dish. {{replate}}',
    JSON.stringify({ input_fidelity: 'high', toggles: { replate: { on: 'FAKE-ON', off: 'FAKE-OFF' } } }),
  ])
  return id
}

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedToggledTemplate()
})

afterAll(async () => {
  await db.end()
})

async function inputsOf(jobId: string) {
  const { rows } = await db.query<{ inputs: Record<string, unknown> }>('select inputs from public.generation_jobs where id = $1', [jobId])
  return rows[0]?.inputs
}

async function setup() {
  const userId = await createUser(db, { credits: 3 })
  const r2 = createMemoryStore()
  const inputKey = newInputKey(userId, 'image/jpeg')
  r2.upload(inputKey, await jpeg(1600, 1200), 'image/jpeg')
  const fake = fakeProvider()
  const deps = { db: serviceSupabase(), store: r2.store, provider: fake.provider, providerTimeoutMs: 200, now: () => NOW }
  const request = (overrides: Partial<GenerationRequest> = {}): GenerationRequest => ({ userId, source: 'web', templateId, inputKey, ...overrides })
  return { userId, fake, deps, request }
}

describe('template toggles on the web (T89)', () => {
  it('renders the off fragment by default and stores the toggle as off', async () => {
    const { fake, deps, request } = await setup()
    const view = await runGeneration(deps, request())
    expect(fake.calls[0]?.prompt).toBe('WRAPPED dish. FAKE-OFF')
    // The fragments only feed the prompt; the provider gets the rest of model_params.
    expect(fake.calls[0]?.params).toEqual({ input_fidelity: 'high' })
    const inputs = await inputsOf(view.id)
    expect(inputs?.toggles).toEqual({ replate: false })
    expect(inputs).not.toHaveProperty('toggles_confirmed_at')
  })

  it('refuses the toggle on without the confirm flag, before any credit moves', async () => {
    const { userId, fake, deps, request } = await setup()
    await expect(runGeneration(deps, request({ toggles: { replate: true } }))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(fake.generate).not.toHaveBeenCalled()
    expect((await profileOf(db, userId)).credits).toBe(3)
  })

  it('renders the on fragment once confirmed and records the server time of the confirmation', async () => {
    const { fake, deps, request } = await setup()
    const view = await runGeneration(deps, request({ toggles: { replate: true }, togglesConfirmed: ['replate'] }))
    expect(fake.calls[0]?.prompt).toBe('WRAPPED dish. FAKE-ON')
    const inputs = await inputsOf(view.id)
    expect(inputs?.toggles).toEqual({ replate: true })
    expect(inputs?.toggles_confirmed_at).toEqual({ replate: NOW.toISOString() })
  })
})

describe('template toggles on the partner API (T89)', () => {
  it('ignores any toggle a partner sends: always off, nothing confirmed', async () => {
    const userId = await linkedUser(db, { credits: 3 })
    const fake = fakeProvider()
    const deps = { ...routeDeps(createMemoryStore().store), provider: fake.provider, providerTimeoutMs: 200 }
    const body = { template_id: templateId, inputs: { copy: {}, toggles: { replate: true }, toggles_confirmed: ['replate'] } }
    const response = await handleGenerate(partnerRequest('/api/partner/generate', { method: 'POST', account: userId, idempotencyKey: randomUUID(), body }), deps)
    expect(response.status).toBe(200)
    const { job_id: jobId } = (await response.json()) as { job_id: string }
    expect(fake.calls[0]?.prompt).toBe('WRAPPED dish. FAKE-OFF')
    expect((await inputsOf(jobId))?.toggles).toEqual({ replate: false })
  })
})
