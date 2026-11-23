import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

vi.mock('./localize', () => ({ localizeTemplate: (template: { id: string }, locale: string) => ({ id: template.id, locale }) }))
const { webTemplatesIn } = await import('./list-templates')

const row = (id: string, { system = false, poster = false } = {}) =>
  ({ id, categoryInfo: { isSystem: system }, fields: { poster: poster || undefined } }) as never

// One read of web_templates() serves every cached list (cached-catalogue.ts); each list keeps the
// filter it had when it read the database itself.
describe('webTemplatesIn', () => {
  const rows = [row('a'), row('sys', { system: true }), row('p', { poster: true })]

  it('the catalogue: no system templates, no poster templates, in the page language', () => {
    expect(webTemplatesIn(rows, 'zh')).toEqual([{ id: 'a', locale: 'zh' }])
  })

  it('the poster list: poster templates only', () => {
    expect(webTemplatesIn(rows, 'en', { posters: true })).toEqual([{ id: 'p', locale: 'en' }])
  })

  it('a lookup by id finds either kind, never a system template', () => {
    expect(webTemplatesIn(rows, 'en', { id: 'p' }).map((t) => (t as { id: string }).id)).toEqual(['a', 'p'])
  })
})

// web_templates() takes 0.4-8 s on production; with only in-memory caches every new server instance
// read it again per language and per list, and concurrent reads hit the statement timeout.
describe('cached catalogue reads (cached-catalogue.ts)', () => {
  const source = readFileSync(join(process.cwd(), 'src/core/templates/cached-catalogue.ts'), 'utf8')

  it('reads the web rows from the database in one place, a remote (shared) cache', () => {
    const shared = /async function sharedWebTemplates\(\)[^{]*\{\s*'use cache: remote'[\s\S]*?\n\}/.exec(source)?.[0]
    expect(shared).toContain("listTemplates(createAdminSupabase(), 'web', { includeSeriesMembers: true })")
    expect(source.match(/listTemplates\(/g)).toHaveLength(1)
  })

  it('the catalogue, the app list and the poster list all go through it', () => {
    expect(source).toMatch(/readCatalogue[\s\S]*?sharedWebTemplates\(\)/)
    expect(source).toMatch(/cachedWebTemplates[\s\S]*?webTemplatesIn\(await sharedWebTemplates\(\), locale\)/)
    expect(source).toMatch(/cachedPosterTemplates[\s\S]*?webTemplatesIn\(await sharedWebTemplates\(\), locale, \{ posters: true \}\)/)
  })
})
