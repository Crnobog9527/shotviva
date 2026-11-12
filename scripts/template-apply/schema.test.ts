import { describe, expect, it } from 'vitest'

import { contentImageId } from './assets'
import { isStyleRefKey } from '../../src/core/templates/style-refs'
import { parseBatch } from './schema'
import { readOptions, targetOf, type Env } from './options'
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
    const templates = Array.from({ length: 200 }, (_, i) => ({ id: `t-${i}` }))
    const categories = Array.from({ length: 51 }, (_, i) => ({ key: `c-${i}`, nameEn: `C${i}`, nameZh: `类${i}` }))
    const series = Array.from({ length: 25 }, (_, i) => ({ slug: `s-${i}` }))
    expect(() => parseBatch({ templates, categories, series })).toThrow('BATCH_TOO_LARGE')
    expect(parseBatch({ templates, categories: categories.slice(0, 50), series }).templates).toHaveLength(200)
    for (const input of [{ templates: [{ id: 'a', prompt: { body: secret, extra: 1 } }] },
      { templates: [{ id: 'a' }, { id: 'a' }] }, { templates: [{ id: 'a', styleRefs: ['x.gif'] }] }, { nope: [] }]) {
      expect(() => parseBatch(input)).toThrow()
      try { parseBatch(input) } catch (error) { expect(String(error)).not.toContain(secret) }
    }
  })
})

describe('target', () => {
  const env = (url: string, extra: Partial<Env> = {}) => ({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'k',
    SHOTVIVA_IMPORT_ADMIN_ID: '11111111-1111-4111-8111-111111111111', ...extra }) as Env
  it('writes the test site or a local stack, never production, with the target\'s own buckets', () => {
    expect(targetOf(env('https://pnzkiqvktkzznfbyhphe.supabase.co'))).toMatchObject({ name: 'preview', storage: { publicBucket: 'shotviva-assets-preview' } })
    expect(targetOf(env('http://127.0.0.1:54321'))).toMatchObject({ name: 'local', storage: null })
    expect(() => targetOf(env('https://irbqamjuazkkyvnnzupf.supabase.co'))).toThrow('T93')
    expect(() => targetOf(env('http://pnzkiqvktkzznfbyhphe.supabase.co'))).toThrow()
    expect(() => targetOf(env('https://other.supabase.co'))).toThrow()
    const jwt = (ref: string) => ['x', Buffer.from(JSON.stringify({ ref, role: 'service_role' })).toString('base64url'), 'y'].join('.')
    expect(() => targetOf(env('https://pnzkiqvktkzznfbyhphe.supabase.co', { SUPABASE_SERVICE_ROLE_KEY: jwt('irbqamjuazkkyvnnzupf') }))).toThrow()
    expect(() => targetOf(env('https://pnzkiqvktkzznfbyhphe.supabase.co', { R2_PUBLIC_BUCKET: 'shotviva-assets' }))).toThrow('R2_PUBLIC_BUCKET')
    expect(() => targetOf(env('https://pnzkiqvktkzznfbyhphe.supabase.co', { NEXT_PUBLIC_ASSETS_BASE_URL: 'https://shotviva.com/assets' }))).toThrow('NEXT_PUBLIC_ASSETS_BASE_URL')
  })

  it('reads batch files only from a .local folder', () => {
    expect(readOptions(['.local/templates/a.json', '--dry-run'], '/repo')).toEqual({ file: '/repo/.local/templates/a.json', dryRun: true })
    expect(() => readOptions(['scripts/a.json'], '/repo')).toThrow('.local')
    expect(() => readOptions([], '/repo')).toThrow()
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
