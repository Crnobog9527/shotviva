import { z } from 'zod'

import type { Locale } from '../i18n/locales'

// Template categories are rows in template_categories, managed in admin (ARCHITECTURE §5,
// T75). templates.category holds the `key`, which never changes; pages, analytics and caches
// use the key, people see the name in their language.

export const CARD_STYLES = ['pair', 'compare'] as const
export type CardStyle = (typeof CARD_STYLES)[number]

export const CATEGORY_LIMITS = { key: 40, nameEn: 32, nameZh: 12, intro: 200 } as const

export type Category = {
  key: string
  nameEn: string
  nameZh: string
  // The home page's line under the category heading; null shows no line.
  introEn: string | null
  introZh: string | null
  // 'compare': the drag compare card (today only 画风); 'pair': the side-by-side pair.
  cardStyle: CardStyle
  sortOrder: number
  // A built-in template's category (photo edit, partner freeform): never on Create or the home
  // page, not editable or deletable in admin.
  isSystem: boolean
}

export type CategoryRow = {
  key: string
  name_en: string
  name_zh: string
  intro_en: string | null
  intro_zh: string | null
  card_style: CardStyle
  sort_order: number
  is_system: boolean
}

export const CATEGORY_COLUMNS = 'key, name_en, name_zh, intro_en, intro_zh, card_style, sort_order, is_system'

export function toCategory(row: CategoryRow): Category {
  return {
    key: row.key,
    nameEn: row.name_en,
    nameZh: row.name_zh,
    introEn: row.intro_en,
    introZh: row.intro_zh,
    cardStyle: row.card_style,
    sortOrder: row.sort_order,
    isSystem: row.is_system,
  }
}

// Only while a database has no template_categories yet (before migration 0580–0583, or a
// deployment rolled back onto it): the template's stored English name stands in for both
// names, with no intro, and 'Art Styles' keeps the drag compare as before T75. Goes with the
// card that drops templates.category.
const PRE_T75_SYSTEM = new Set(['edit', 'freeform'])
export function preT75Category(name: string): Category {
  return {
    key: suggestCategoryKey(name) || 'uncategorized',
    nameEn: name,
    nameZh: name,
    introEn: null,
    introZh: null,
    cardStyle: name === 'Art Styles' ? 'compare' : 'pair',
    sortOrder: 0,
    isSystem: PRE_T75_SYSTEM.has(name),
  }
}

// A category as one page shows it.
export type LocalizedCategory = { key: string; name: string; intro: string; compare: boolean; sortOrder: number }

export function localizeCategory(category: Category, locale: Locale): LocalizedCategory {
  const zh = locale === 'zh'
  return {
    key: category.key,
    name: zh ? category.nameZh : category.nameEn,
    intro: (zh ? category.introZh : category.introEn) ?? '',
    compare: category.cardStyle === 'compare',
    sortOrder: category.sortOrder,
  }
}

export const CATEGORY_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

// The key the admin form proposes for a new category: its English name as a slug
// ("Food & Drink" → "food-drink"). Empty when the name has no Latin letters or digits.
export function suggestCategoryKey(nameEn: string): string {
  return nameEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CATEGORY_LIMITS.key)
    .replace(/-+$/, '')
}

const optionalIntro = z
  .string()
  .trim()
  .max(CATEGORY_LIMITS.intro)
  .transform((text) => (text === '' ? null : text))

// What the admin form sends; the SQL function checks it again (0582).
export const categoryInputSchema = z.object({
  key: z.string().trim().min(1).max(CATEGORY_LIMITS.key).regex(CATEGORY_KEY_PATTERN),
  nameEn: z.string().trim().min(1).max(CATEGORY_LIMITS.nameEn),
  nameZh: z.string().trim().min(1).max(CATEGORY_LIMITS.nameZh),
  introEn: optionalIntro,
  introZh: optionalIntro,
  cardStyle: z.enum(CARD_STYLES),
})

export type CategoryInput = z.infer<typeof categoryInputSchema>
