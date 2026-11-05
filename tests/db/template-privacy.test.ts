import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listTemplates } from '@/core/templates'

import { connectAdmin } from './helpers'
import { anonSupabase as anonClient, serviceSupabase as serviceClient } from './supabase-env'


// T3 acceptance: prompts are unreadable by clients, and the web catalogue hides partner-only
// and unpublished templates (ARCHITECTURE §5).

const WEB_LIVE = 'test-privacy-web-live'
const WEB_DRAFT = 'test-privacy-web-draft'
const FAKE_BODY = 'FAKE PROMPT BODY FOR TESTS'

const fields = { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] }

async function seed(id: string, isActive: boolean) {
  const { error } = await serviceClient().rpc('admin_upsert_template', {
    p_template: {
      id,
      name: id,
      category: 'test',
      fields,
      quality: 'medium',
      credits_cost: { '1k': 1, '2k': 2, '3k': 3 },
      visible_in: ['web'],
      is_active: isActive,
    },
    p_prompt: { body: FAKE_BODY, model_params: {} },
  })
  if (error) throw new Error(error.message)
}

describe('template privacy', () => {
  let pg: Client

  beforeAll(async () => {
    pg = await connectAdmin()
    await seed(WEB_LIVE, true)
    await seed(WEB_DRAFT, false)
  })

  afterAll(async () => {
    await pg.query('delete from public.templates where id like $1', ['test-privacy-%'])
    await pg.end()
  })

  it('anon select * from template_prompts returns nothing', async () => {
    const { data } = await anonClient().from('template_prompts').select('*')
    expect(data ?? []).toEqual([])
  })

  it('anon and authenticated roles cannot read prompts even through SQL', async () => {
    for (const role of ['anon', 'authenticated']) {
      await pg.query('begin')
      await pg.query(`set local role ${role}`)
      await expect(pg.query('select * from public.template_prompts')).rejects.toThrow(/permission denied/)
      await pg.query('rollback')
    }
  })

  it('keeps RLS on template_prompts with no policies, so a stray grant still exposes nothing', async () => {
    const { rows } = await pg.query<{ rls: boolean; policies: string }>(
      `select c.relrowsecurity as rls,
              (select count(*) from pg_policies p where p.tablename = 'template_prompts') as policies
         from pg_class c where c.oid = 'public.template_prompts'::regclass`,
    )
    expect(rows[0]).toEqual({ rls: true, policies: '0' })
  })

  it('web template list excludes freeform and unpublished templates', async () => {
    const ids = (await listTemplates(anonClient(), 'web')).map((template) => template.id)
    expect(ids).toContain(WEB_LIVE)
    expect(ids).not.toContain('freeform')
    expect(ids).not.toContain(WEB_DRAFT)
  })

  it('the public catalogue carries quality, the three prices and the cover media fields', async () => {
    const live = (await listTemplates(anonClient(), 'web')).find((template) => template.id === WEB_LIVE)
    expect(live).toMatchObject({
      quality: 'medium',
      creditsCost: { '1k': 1, '2k': 2, '3k': 3 },
      coverMediaType: 'image',
      coverVideoUrl: null,
      coverPosterUrl: null,
    })
  })

  it('partner list includes the built-in freeform template', async () => {
    const templates = await listTemplates(anonClient(), 'partner')
    expect(templates.find((template) => template.id === 'freeform')?.fields.copy[0]?.key).toBe('prompt')
  })

  it('anon cannot see drafts directly, write templates or call admin functions', async () => {
    const anon = anonClient()
    const { data: drafts } = await anon.from('templates').select('id').eq('id', WEB_DRAFT)
    expect(drafts).toEqual([])
    const { error: insertError } = await anon.from('templates').insert({ id: 'test-privacy-x', name: 'x', category: 'x' })
    expect(insertError).not.toBeNull()
    const { error: rpcError } = await anon.rpc('admin_reorder_templates', { p_ids: [WEB_LIVE] })
    expect(rpcError).not.toBeNull()
  })
})
