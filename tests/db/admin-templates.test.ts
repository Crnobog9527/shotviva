import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listAdminTemplates, saveTemplate, setTemplateActive, setTemplateOrder } from '@/core/admin'

import { CREDITS_FLOOR } from '@/modules/image/credits-floor'

import { connectAdmin, createUser, approveFixtures } from './helpers'
import { serviceSupabase as serviceClient } from './supabase-env'


const ADMIN_ID = '00000000-0000-0000-0000-000000000001'
const A = 'test-admin-a'
const B = 'test-admin-b'

const template = (id: string, name = id) => ({
  id,
  name,
  category: 'pets',
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
    await approveFixtures(pg,A,B)
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

  // T76: a drop saves the whole catalogue's order in one call. Other test files add templates
  // at the same time, so the full list is read and saved inside one locked transaction.
  it('rewrites the whole catalogue order in one call, the built-in edit template left out', async () => {
    const admin = await createUser(pg)
    await pg.query("update public.profiles set role = 'admin' where id = $1", [admin])
    await pg.query('begin')
    try {
      await pg.query('lock table public.templates in share row exclusive mode')
      const { rows } = await pg.query<{ id: string }>("select id from public.templates where id <> 'edit' order by sort_order, id")
      const others = rows.map((row) => row.id).filter((id) => id !== A && id !== B)
      await pg.query('select public.admin_set_template_order($1, $2, $3)', ['catalogue', [B, ...others, A], admin])
      await pg.query('commit')
    } catch (error) {
      await pg.query('rollback')
      throw error
    }
    const listed = await listAdminTemplates(client)
    const ids = listed.map((row) => row.id)
    expect(ids[0]).toBe(B)
    expect(ids.indexOf(B)).toBeLessThan(ids.indexOf(A))
    expect(ids.at(-1)).toBe(A)
  })

  it('refuses a partial list, a repeat and a caller who is not an admin, changing nothing', async () => {
    const admin = await createUser(pg)
    await pg.query("update public.profiles set role = 'admin' where id = $1", [admin])
    const before = (await listAdminTemplates(client)).map((row) => row.id)
    await expect(setTemplateOrder(client, admin, { group: 'catalogue', ids: [A, B] })).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(setTemplateOrder(client, admin, { group: 'catalogue', ids: [A, A] })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
    await expect(pg.query('select public.admin_set_template_order($1, $2, $3)', ['catalogue', [A, A], admin])).rejects.toThrow(
      /INVALID_INPUT/,
    )
    const visitor = await createUser(pg)
    await expect(setTemplateOrder(client, visitor, { group: 'catalogue', ids: before })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    const after = (await listAdminTemplates(client)).map((row) => row.id)
    expect(after.indexOf(B)).toBeLessThan(after.indexOf(A))
  })
})

// T89: a toggle must be wired into the private prompt before the template can be saved.
describe('admin template toggles', () => {
  const client = serviceClient()
  const T = 'test-admin-toggle'
  const toggled = { ...template(T), fields: { ...template(T).fields, toggles: [{ key: 'replate', label: 'Upgrade plating' }] } }
  const fragments = { toggles: { replate: { on: 'FAKE-ON', off: 'FAKE-OFF' } } }

  afterAll(async () => {
    const pg = await connectAdmin()
    await pg.query('delete from public.templates where id = $1', [T])
    await pg.end()
  })

  it('refuses a toggle without its placeholder or a fragment, and saves one wired in', async () => {
    const save = (body: string, modelParams: Record<string, unknown>) => saveTemplate(client, ADMIN_ID, { isNew: true, template: toggled, prompt: { body, modelParams } }, CREDITS_FLOOR)
    await expect(save('FAKE BODY', fragments)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(save('FAKE BODY {{replate}}', { toggles: { replate: { on: 'FAKE-ON' } } })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await save('FAKE BODY {{replate}}', fragments)
    const saved = (await listAdminTemplates(client)).find((row) => row.id === T)
    expect(saved?.fields.toggles).toEqual([{ key: 'replate', label: 'Upgrade plating', default: false }])
    expect(saved?.prompt?.modelParams).toEqual(fragments)
  })
})
