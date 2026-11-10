import { CATEGORY_KEY_PATTERN, CATEGORY_LIMITS, suggestCategoryKey, type CardStyle } from '@/core/templates/categories'

import type { AdminCategoryNode, SaveCategoryPayload } from '../template-categories/types'

export type CategoryFormValues = {
  key: string
  // A new category's key follows its English name until the admin types one.
  keyTouched: boolean
  parentId: string | null
  slug: string
  slugTouched: boolean
  isVisible: boolean
  seoTitleEn: string
  seoTitleZh: string
  seoDescriptionEn: string
  seoDescriptionZh: string
  nameZh: string
  nameEn: string
  introZh: string
  introEn: string
  cardStyle: CardStyle
}

export function emptyCategoryValues(parentId: string | null = null): CategoryFormValues {
  return { key: '', keyTouched: false, parentId, slug: '', slugTouched: false, isVisible: true,
    seoTitleEn: '', seoTitleZh: '', seoDescriptionEn: '', seoDescriptionZh: '', nameZh: '', nameEn: '', introZh: '', introEn: '', cardStyle: 'pair' }
}

export function toCategoryValues(category: AdminCategoryNode): CategoryFormValues {
  return {
    key: category.key,
    keyTouched: true, parentId: category.parentId, slug: category.slug, slugTouched: true, isVisible: category.isVisible,
    seoTitleEn: category.seoTitleEn ?? '', seoTitleZh: category.seoTitleZh ?? '',
    seoDescriptionEn: category.seoDescriptionEn ?? '', seoDescriptionZh: category.seoDescriptionZh ?? '',
    nameZh: category.nameZh,
    nameEn: category.nameEn,
    introZh: category.introZh ?? '',
    introEn: category.introEn ?? '',
    cardStyle: category.cardStyle,
  }
}

// Applies one edit; on a new category an untouched key keeps following the English name.
export function patchCategoryValues(values: CategoryFormValues, patch: Partial<CategoryFormValues>, isNew: boolean): CategoryFormValues {
  const next = { ...values, ...patch }
  if ('key' in patch) next.keyTouched = true
  if (isNew && !next.keyTouched && 'nameEn' in patch) next.key = suggestCategoryKey(next.nameEn)
  if ('slug' in patch) next.slugTouched = true
  if (isNew && !next.slugTouched) next.slug = next.key
  return next
}

const within = (text: string, max: number) => text.trim().length > 0 && text.trim().length <= max

// The payload for the save action, or null when a required field is missing or malformed
// (the server checks the same rules again).
export function buildCategoryPayload(values: CategoryFormValues, isNew: boolean): SaveCategoryPayload | null {
  const key = values.key.trim()
  const ok =
    within(values.nameZh, CATEGORY_LIMITS.nameZh) &&
    within(values.nameEn, CATEGORY_LIMITS.nameEn) &&
    key.length <= CATEGORY_LIMITS.key &&
    CATEGORY_KEY_PATTERN.test(key) && CATEGORY_KEY_PATTERN.test(values.slug) && values.slug.length <= CATEGORY_LIMITS.key
  if (!ok) return null
  return {
    isNew,
    category: {
      key, parentId: values.parentId, slug: values.slug, isVisible: values.isVisible,
      seoTitleEn: values.seoTitleEn.trim(), seoTitleZh: values.seoTitleZh.trim(),
      seoDescriptionEn: values.seoDescriptionEn.trim(), seoDescriptionZh: values.seoDescriptionZh.trim(),
      nameZh: values.nameZh.trim(),
      nameEn: values.nameEn.trim(),
      introZh: values.introZh.trim(),
      introEn: values.introEn.trim(),
      cardStyle: values.cardStyle,
    },
  }
}
