import { describe, expect, it, vi } from 'vitest'

import { selectTemplates } from './select-templates'
import { PRE_T75_TEMPLATE_COLUMNS, TEMPLATE_COLUMNS, toTemplate, type PreT75TemplateRow } from './types'

// T75 is expand-only: this build must still read templates from a database before migrations
// 0580–0583 (promoted before the DB push, or restored onto it).
describe('selectTemplates', () => {
  it('reads category_key and the category when the database has them', async () => {
    const read = vi.fn(async (columns: string) => ({ data: [columns.length > 0 ? 1 : 0], error: null }))
    expect(await selectTemplates(read, ', extra')).toEqual({ data: [1], error: null })
    expect(read).toHaveBeenCalledOnce()
    expect(read).toHaveBeenCalledWith(`${TEMPLATE_COLUMNS}, extra`)
    expect(TEMPLATE_COLUMNS).toContain('category_key, template_categories(')
  })

  it('reads again with the pre-T75 columns when the relationship or the column is missing', async () => {
    for (const error of [
      { code: 'PGRST200', message: "Could not find a relationship between 'templates' and 'template_categories'" },
      { code: '42703', message: 'column templates.category_key does not exist' },
    ]) {
      const read = vi.fn(async (columns: string) => (columns.includes('category_key') ? { data: null, error } : { data: ['old'], error: null }))
      expect(await selectTemplates(read)).toEqual({ data: ['old'], error: null })
      expect(read).toHaveBeenLastCalledWith(PRE_T75_TEMPLATE_COLUMNS)
    }
  })

  it('passes any other error through without a second read', async () => {
    const error = { code: '42501', message: 'permission denied' }
    const read = vi.fn(async (columns: string) => ({ data: columns ? null : null, error }))
    expect(await selectTemplates(read)).toEqual({ data: null, error })
    expect(read).toHaveBeenCalledOnce()
  })

  it('turns a pre-T75 row into a template keyed by its name as a slug', () => {
    const row = {
      id: 'manhwa',
      module: 'image',
      name: 'Manhwa',
      description: null,
      category: 'Art Styles',
      cover_before_url: null,
      cover_after_url: null,
      cover_media_type: 'image',
      cover_video_url: null,
      cover_poster_url: null,
      fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
      quality: 'high',
      credits_cost: { '1k': 2, '2k': 4, '3k': 6 },
      sort_order: 10,
      is_active: true,
      visible_in: ['web'],
      translations: null,
      featured_rank: null,
      created_at: '2026-11-08T00:00:00Z',
      updated_at: '2026-11-08T00:00:00Z',
    } satisfies PreT75TemplateRow
    const template = toTemplate(row)
    expect(template.category).toBe('art-styles')
    expect(template.categoryInfo).toMatchObject({ nameEn: 'Art Styles', cardStyle: 'compare', isSystem: false })
  })
})
