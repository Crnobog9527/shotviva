import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import type { Template } from '../templates/types'
import { maskEmail, partnerProfile, toPartnerTemplate } from './partner-views'

// Just enough of a client for `from('profiles').select(...).eq(...).maybeSingle()`.
const clientReturning = (row: Record<string, unknown>) =>
  ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
  }) as unknown as SupabaseClient

describe('partnerProfile', () => {
  it('reads both pools and the display-only membership date', async () => {
    const profile = await partnerProfile(
      clientReturning({ credits: 30, free_credits: 3, paid_until: '2030-01-01T00:00:00+00:00' }),
      'u',
    )
    expect(profile).toEqual({ credits: 30, freeCredits: 3, paidUntil: '2030-01-01T00:00:00.000Z' })
  })
})

describe('maskEmail', () => {
  it.each([
    ['jane@gmail.com', 'j***@gmail.com'],
    [null, 'Shotviva account'],
    ['@nobody', 'Shotviva account'],
  ])('%s → %s', (email, masked) => {
    expect(maskEmail(email)).toBe(masked)
  })
})

describe('partner template taxonomy', () => {
  const template: Template = {
    id: 'dish', module: 'image', name: 'Dish', description: null, category: 'food-drink',
    categoryInfo: { key: 'food-drink', nameEn: 'Food & Drink', nameZh: '餐饮', introEn: null, introZh: null,
      cardStyle: 'pair', sortOrder: 1, isSystem: false },
    coverBeforeUrl: null, coverAfterUrl: null, coverVideoUrl: null, coverPosterUrl: null, coverMediaType: 'image', coverLocales: {},
    fields: { images: { min: 1, max: 1 }, copy: [], toggles: [], aspectRatios: ['1:1'] },
    creditsCost: { '1k': 2, '2k': 4, '3k': 6 }, quality: 'high', sortOrder: 0, isActive: true, visibleIn: ['partner'],
    translations: {}, featuredRank: null, createdAt: '', updatedAt: '',
  }

  it('keeps the original English category and every existing field when a template joins a nested series', () => {
    const flat = toPartnerTemplate(template)
    expect(flat).toMatchObject({ category: 'Food & Drink', category_path: ['food-drink'], series: null })
    const categoryPath = ['food-drink', 'dark', 'dish']
    const series = { id: '233f41ae-dccb-4c34-b0af-0bc319a1f211', slug: 'night', name: 'Night' }
    expect(toPartnerTemplate({ ...template, categoryPath, series })).toEqual({ ...flat, category_path: categoryPath, series })
  })
})
