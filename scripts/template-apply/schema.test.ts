import { describe, expect, it } from 'vitest'

import { contentImageId } from './assets'
import { isStyleRefKey } from '../../src/core/templates/style-refs'
import { decodeProductionBatch, encodeBatch, structureOnly } from './production'
import { parseBatch } from './schema'
import { targetOf, type Env } from './options'
import { failureText } from './report'

describe('batch file', () => {
  it('accepts the existing batch format and the new keys', () => {
    const batch = parseBatch({ templates: [{ id: 'a', name: 'A', category: 'western', isActive: false, prompt: { body: 'x' },
      model: 'default', styleRefs: ['refs/a.webp'], cover: { after: 'covers/a.png' }, openSale: true, publish: true }] })
    expect(batch).toMatchObject({ categories: [], series: [], templates: [{ id: 'a', publish: true }] })
    expect(batch.templates[0]).not.toHaveProperty('quality')
  })

  it('names the path of a problem but never the value, and refuses duplicates and typos', () => {
    const secret = 'SECRET PROMPT TEXT'
    for (const input of [{ templates: [{ id: 'a', prompt: { body: secret, extra: 1 } }] },
      { templates: [{ id: 'a' }, { id: 'a' }] }, { templates: [{ id: 'a', styleRefs: ['x.gif'] }] }, { nope: [] }]) {
      expect(() => parseBatch(input)).toThrow()
      try { parseBatch(input) } catch (error) { expect(String(error)).not.toContain(secret) }
    }
  })
})

describe('production structure batch', () => {
  const batch = parseBatch({ categories: [{ key: 'western', nameEn: 'Western', nameZh: '西餐', parent: 'food-drink' }],
    templates: [{ id: 'a', name: 'A', creditsCost: { '1k': 1, '2k': 2, '3k': 3 }, prompt: { body: 'secret' },
      styleRefs: ['a.png'], category: 'western', series: 'set', model: 'default', openSale: true, publish: true }] })

  it('keeps only categories, series and per-template filing, model, sale and publish', () => {
    expect(structureOnly(batch).templates).toEqual([{ id: 'a', category: 'western', series: 'set', model: 'default', openSale: true, publish: true }])
    const encoded = encodeBatch(batch)
    expect(Buffer.from(encoded, 'base64').toString('latin1')).not.toContain('secret')
    expect(decodeProductionBatch(encoded).templates[0]).not.toHaveProperty('prompt')
  })

  it('refuses a workflow input that carries content', async () => {
    const { gzipSync } = await import('node:zlib')
    const raw = gzipSync(Buffer.from(JSON.stringify({ templates: [{ id: 'a', prompt: { body: 'x' } }] }))).toString('base64')
    expect(() => decodeProductionBatch(raw)).toThrow('STRUCTURE_ONLY')
    expect(() => decodeProductionBatch('not-base64-gzip')).toThrow('BATCH_UNREADABLE')
  })
})

describe('target', () => {
  const env = (url: string, extra: Partial<Env> = {}) => ({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'k',
    SHOTVIVA_IMPORT_ADMIN_ID: '11111111-1111-4111-8111-111111111111', ...extra }) as Env
  it('writes the test site or a local stack, and production only from the workflow', () => {
    expect(targetOf(env('https://pnzkiqvktkzznfbyhphe.supabase.co'))).toBe('preview')
    expect(targetOf(env('http://127.0.0.1:54321'))).toBe('local')
    expect(() => targetOf(env('https://irbqamjuazkkyvnnzupf.supabase.co'))).toThrow('工作流')
    expect(() => targetOf(env('https://irbqamjuazkkyvnnzupf.supabase.co', { TEMPLATE_APPLY_TARGET: 'production' }))).toThrow()
    expect(targetOf(env('https://irbqamjuazkkyvnnzupf.supabase.co', { TEMPLATE_APPLY_TARGET: 'production', GITHUB_ACTIONS: 'true' }))).toBe('production')
    expect(() => targetOf(env('https://pnzkiqvktkzznfbyhphe.supabase.co', { TEMPLATE_APPLY_TARGET: 'production', GITHUB_ACTIONS: 'true' }))).toThrow()
    expect(() => targetOf(env('https://other.supabase.co'))).toThrow()
  })
})

it('gives the same style reference key to the same file, in the stored key format', () => {
  const a = contentImageId(new Uint8Array([1, 2, 3]))
  expect(contentImageId(new Uint8Array([1, 2, 3]))).toBe(a)
  expect(contentImageId(new Uint8Array([1, 2, 4]))).not.toBe(a)
  expect(isStyleRefKey('demo', `style-refs/demo/${a}.webp`)).toBe(true)
})

it('shows our own error codes with their detail and hides any other database message', () => {
  expect(failureText({ ref: 'x', ok: false, code: 'MODEL_CREDIT_FLOOR', detail: '1k 积分低于所选模型下限' })).toContain('1k')
  expect(failureText({ ref: 'x', ok: false, code: 'DB_ERROR', sqlstate: '23505', constraint: 'template_series_slug_key' })).toContain('template_series_slug_key')
  expect(failureText({ ref: 'x', ok: false, code: 'DB_ERROR', sqlstate: '23502' })).toBe('数据库错误（23502）')
})
