import type { AdminTemplate } from '../../src/core/admin/templates/types'
import type { ProviderFloors } from '../../src/core/templates/provider-pricing'
import type { DbState } from './state'

// A small in-memory target for the planner's unit tests (the database tests use a real stack).

export const SEEDREAM = '11111111-1111-4111-8111-111111111111'
const tiers = { '1k': 10, '2k': 20, '4k': 30 }
export const floors: ProviderFloors = {
  high: tiers, medium: tiers, resolutions: ['1k', '2k', '4k'], activeProvider: 'env',
  providers: { env: { high: tiers, medium: tiers, resolutions: ['1k', '2k', '4k'] },
    [SEEDREAM]: { high: tiers, medium: tiers, resolutions: ['1k', '2k'] } },
  models: { env: 'env-model', [SEEDREAM]: 'seedream-4' },
}

export const fields = { images: { min: 1, max: 1 }, copy: [], toggles: [], aspectRatios: ['1:1'] }

export function stored(id: string, extra: Partial<AdminTemplate> = {}): AdminTemplate {
  return {
    id, module: 'image', name: `Name ${id}`, description: 'A description', category: 'food-drink',
    categoryInfo: { key: 'food-drink', nameEn: 'Food', nameZh: '餐饮', introEn: null, introZh: null, cardStyle: 'pair', sortOrder: 0, isSystem: false },
    coverBeforeUrl: 'https://assets.test/covers/x/before.webp', coverAfterUrl: 'https://assets.test/covers/x/after.webp',
    coverMediaType: 'image', coverVideoUrl: null, coverPosterUrl: null, coverLocales: {},
    fields, quality: 'high', creditsCost: { '1k': 40, '2k': 80, '4k': 120 }, sortOrder: 10, isActive: false,
    visibleIn: ['web'], translations: {}, featuredRank: null, createdAt: '', updatedAt: '',
    subcategoryKey: null, seriesId: null, seriesSortOrder: 0, saleEnabled: false, unpricedResolutions: [],
    prompt: { styleRefs: [], providerId: null, body: 'Prompt body', version: 3, modelParams: {} },
    ...extra,
  } as AdminTemplate
}

export function state(templates: AdminTemplate[] = [], extra: Partial<DbState> = {}): DbState {
  const category = (key: string, parent: string | null = null) => [key, {
    key, kind: 'template' as const, parent_id: parent, name_en: key, name_zh: key, intro_en: null, intro_zh: null,
    card_style: 'pair', slug: key, is_visible: true, is_system: false,
    seo_title_en: null, seo_title_zh: null, seo_description_en: null, seo_description_zh: null,
  }] as const
  return {
    categories: new Map([category('food-drink'), category('western', 'food-drink')]),
    series: new Map(), seriesSlugs: new Map(), templates: new Map(templates.map(t => [t.id, t])),
    providers: [{ id: 'env', label: 'Default', model: 'env-model', isActive: true, openAI: true, capabilities: null, floor: floors },
      { id: SEEDREAM, label: 'Seedream', model: 'seedream-4', isActive: false, openAI: false, capabilities: null, floor: floors }],
    floors, testRuns: new Map(), ...extra,
  }
}
