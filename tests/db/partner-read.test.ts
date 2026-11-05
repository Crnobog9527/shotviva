import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { handleGenerate, handleJob, handleTemplates } from '@/core/partner'

import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, seedTemplate } from './generation-fixtures'
import { connectAdmin } from './helpers'
import { linkedUser, partnerRequest, routeDeps } from './partner-fixtures'

// The read-only partner routes: template catalogue and job status.

let db: Client
let partnerTemplate: string
let webOnlyTemplate: string

beforeAll(async () => {
  db = await connectAdmin()
  partnerTemplate = await seedTemplate(db, { visibleIn: ['partner'] })
  webOnlyTemplate = await seedTemplate(db, { visibleIn: ['web'] })
})

afterAll(async () => {
  await db.end()
})

describe('GET /api/partner/templates', () => {
  it('lists partner templates, freeform included, without prompts', async () => {
    const response = await handleTemplates(partnerRequest('/api/partner/templates'), routeDeps())
    expect(response.status).toBe(200)
    const text = await response.text()
    const ids = (JSON.parse(text) as { templates: { id: string }[] }).templates.map((t) => t.id)
    expect(ids).toContain('freeform')
    expect(ids).toContain(partnerTemplate)
    expect(ids).not.toContain(webOnlyTemplate)
    expect(text).not.toContain('WRAPPED')
    const freeform = JSON.parse(text).templates.find((t: { id: string }) => t.id === 'freeform')
    expect(freeform.fields).toMatchObject({ images: { min: 0, max: 1 }, copy: [{ key: 'prompt', required: true, max_length: 2000 }] })
  })

  it('401s without the partner key', async () => {
    expect((await handleTemplates(partnerRequest('/api/partner/templates', { key: null }), routeDeps())).status).toBe(401)
  })
})

describe('GET /api/partner/jobs/{id}', () => {
  it('returns the owner’s job with a signed URL, and 404s it for any other account', async () => {
    const owner = await linkedUser(db)
    const other = await linkedUser(db)
    const store = createMemoryStore().store
    const deps = { ...routeDeps(store), provider: fakeProvider().provider }
    const body = { template_id: 'freeform', inputs: { copy: { prompt: 'tea' } } }
    const created = await (
      await handleGenerate(partnerRequest('/api/partner/generate', { method: 'POST', account: owner, idempotencyKey: 'k1', body }), deps)
    ).json()

    const own = await handleJob(partnerRequest(`/api/partner/jobs/${created.job_id}`, { account: owner }), deps, created.job_id)
    expect(own.status).toBe(200)
    expect(await own.json()).toMatchObject({ job_id: created.job_id, status: 'succeeded', credits_charged: 2, error: null })

    const foreign = await handleJob(partnerRequest('/x', { account: other }), deps, created.job_id)
    expect(foreign.status).toBe(404)
    expect((await handleJob(partnerRequest('/x', { account: owner }), deps, randomUUID())).status).toBe(404)
    expect((await handleJob(partnerRequest('/x', { account: owner }), deps, 'nope')).status).toBe(404)
  })
})
