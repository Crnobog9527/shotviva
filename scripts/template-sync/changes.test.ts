import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { changedKeys, describeTemplate } from './changes'

const template = {
  id: 'demo', name: 'Demo', fields: { copy: [{ key: 'title', example: 'Grand opening' }] }, translations: { zh: { name: '演示' } },
  cover_before_url: 'https://p.test/covers/demo/b.webp', cover_after_url: 'https://p.test/covers/demo/a.webp', cover_locales: {},
}
const prompt = { body: 'secret prompt', version: 3, model_params: { size: '1k' }, provider_id: null }

function side(snapshot: unknown, extras: { refs?: unknown; profiles?: unknown } = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'read_template_sync_source') return { data: snapshot, error: null }
    if (name === 'read_template_sync_style_refs') return { data: extras.refs ?? [], error: null }
    return { data: extras.profiles ?? { active: 'openai', inactive: [] }, error: null }
  })
  return { db: { rpc } as unknown as SupabaseClient, assets: { base: 'https://p.test', store: {} as never } }
}

describe('changedKeys', () => {
  it('names the columns that differ, never the values', () => {
    const preview = { ...template, fields: { copy: [{ key: 'title' }] } }
    expect(changedKeys(template, preview)).toEqual(['fields'])
  })

  it('compares covers by which slots are filled, not by the per-site address', () => {
    const preview = { ...template, cover_before_url: 'https://q.test/covers/demo/other.webp' }
    expect(changedKeys(template, preview)).toEqual([])
    expect(changedKeys(template, { ...template, cover_after_url: null })).toEqual(['cover_after_url'])
  })

  it('ignores key order inside jsonb', () => {
    expect(changedKeys({ fields: { a: 1, b: 2 } }, { fields: { b: 2, a: 1 } })).toEqual([])
  })
})

describe('describeTemplate', () => {
  it('reports a template the preview does not have as new', async () => {
    expect(await describeTemplate('demo', side({ template, prompt, provider: null }), side(null))).toBe('new on the preview')
  })

  it('lists prompt, translation and profile differences without printing the prompt', async () => {
    const preview = side({ template: { ...template, translations: {} }, prompt: { ...prompt, body: 'older', version: 7 }, provider: null },
      { profiles: { active: 'openai', inactive: [{ profile: 'seedream' }] } })
    const line = await describeTemplate('demo', side({ template, prompt, provider: null }), preview)
    expect(line).toBe('changes: translations, prompt.body, profiles')
    expect(line).not.toContain('secret')
  })

  it('says unchanged when only the prompt version number differs', async () => {
    const line = await describeTemplate('demo', side({ template, prompt, provider: null }), side({ template, prompt: { ...prompt, version: 9 }, provider: null }))
    expect(line).toBe('content unchanged')
  })
})
