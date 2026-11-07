import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listAdminTemplates, reorderTemplates, saveTemplate, setTemplateActive } from '@/core/admin'

import { CREDITS_FLOOR } from '@/modules/image/credits-floor'

import { connectAdmin } from './helpers'
import { serviceSupabase as serviceClient } from './supabase-env'


const ADMIN_ID = '00000000-0000-0000-0000-000000000001'
const A = 'test-admin-a'
const B = 'test-admin-b'

const template = (id: string, name = id) => ({
  id,
  name,
  category: 'test',
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  visibleIn: ['web'],
  fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
  // What a web template needs before it may go live (T60 publish rules).
  description: 'Test template.',
  coverBeforeUrl: `https://assets.test/covers/${id}/before.webp`,
  coverAfterUrl: `https://assets.test/covers/${id}/after.webp`,
})
const prompt = (body: string) => ({ body, modelParams: {} })

describe('admin template commands', () => {
  let pg: Client
  const client = serviceClient()

  beforeAll(async () => {
    pg = await connectAdmin()
  })

  afterAll(async () => {
    await pg.query('delete from public.templates where id like $1', ['test-admin-%'])
    await pg.end()
  })

  it('creates templates unpublished, at the end of the list, with prompt v1', async () => {
    await saveTemplate(client, ADMIN_ID, { isNew: true, template: { ...template(A), isActive: true }, prompt: prompt('one') }, CREDITS_FLOOR)
    await saveTemplate(client, ADMIN_ID, { isNew: true, template: template(B), prompt: prompt('one') }, CREDITS_FLOOR)
    const rows = await listAdminTemplates(client)
    const a = rows.find((row) => row.id === A)
    expect(a).toMatchObject({ isActive: false, prompt: { body: 'one', version: 1 } })
    const b = rows.find((row) => row.id === B)
    expect(b?.sortOrder).toBeGreaterThan(a?.sortOrder ?? Infinity)
  })

  it('rejects a duplicate id on create and an unknown id on edit', async () => {
    await expect(
      saveTemplate(client, ADMIN_ID, { isNew: true, template: template(A), prompt: prompt('x') }, CREDITS_FLOOR),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      saveTemplate(client, ADMIN_ID, { isNew: false, template: template('test-admin-missing'), prompt: prompt('x') }, CREDITS_FLOOR),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('edits public info and bumps the prompt version only when the prompt changes', async () => {
    await saveTemplate(client, ADMIN_ID, { isNew: false, template: template(A, 'Renamed'), prompt: prompt('one') }, CREDITS_FLOOR)
    let a = (await listAdminTemplates(client)).find((row) => row.id === A)
    expect(a).toMatchObject({ name: 'Renamed', prompt: { version: 1 } })
    await saveTemplate(client, ADMIN_ID, { isNew: false, template: template(A, 'Renamed'), prompt: prompt('two') }, CREDITS_FLOOR)
    a = (await listAdminTemplates(client)).find((row) => row.id === A)
    expect(a?.prompt).toMatchObject({ body: 'two', version: 2 })
  })

  it('publishes a complete template but requires a reason to unpublish', async () => {
    await setTemplateActive(client, ADMIN_ID, { id: A, active: true }, CREDITS_FLOOR)
    await expect(setTemplateActive(client, ADMIN_ID, { id: A, active: false }, CREDITS_FLOOR)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
    await setTemplateActive(client, ADMIN_ID, { id: A, active: false, reason: 'cover is wrong' }, CREDITS_FLOOR)
    expect((await listAdminTemplates(client)).find((row) => row.id === A)?.isActive).toBe(false)
  })

  it('keeps the stored status when an edit omits it', async () => {
    await setTemplateActive(client, ADMIN_ID, { id: B, active: true }, CREDITS_FLOOR)
    await saveTemplate(client, ADMIN_ID, { isNew: false, template: template(B, 'B2'), prompt: prompt('one') }, CREDITS_FLOOR)
    expect((await listAdminTemplates(client)).find((row) => row.id === B)?.isActive).toBe(true)
  })

  it('reorders by the given id order', async () => {
    await reorderTemplates(client, ADMIN_ID, [B, A])
    const ids = (await listAdminTemplates(client)).map((row) => row.id)
    expect(ids.indexOf(B)).toBeLessThan(ids.indexOf(A))
    await expect(reorderTemplates(client, ADMIN_ID, [A, A])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
