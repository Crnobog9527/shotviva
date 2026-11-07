import { CATEGORY_KEY_PATTERN, CATEGORY_LIMITS, suggestCategoryKey, type CardStyle } from '@/core/templates/categories'

import type { AdminCategory, SaveCategoryPayload } from '../template-categories/types'

export type CategoryFormValues = {
  key: string
  // A new category's key follows its English name until the admin types one.
  keyTouched: boolean
  nameZh: string
  nameEn: string
  introZh: string
  introEn: string
  cardStyle: CardStyle
}

export function emptyCategoryValues(): CategoryFormValues {
  return { key: '', keyTouched: false, nameZh: '', nameEn: '', introZh: '', introEn: '', cardStyle: 'pair' }
}

export function toCategoryValues(category: AdminCategory): CategoryFormValues {
  return {
    key: category.key,
    keyTouched: true,
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
    CATEGORY_KEY_PATTERN.test(key)
  if (!ok) return null
  return {
    isNew,
    category: {
      key,
      nameZh: values.nameZh.trim(),
      nameEn: values.nameEn.trim(),
      introZh: values.introZh.trim(),
      introEn: values.introEn.trim(),
      cardStyle: values.cardStyle,
    },
  }
}

// Swaps a key with its neighbour; null at either end.
export function moveKey(keys: readonly string[], index: number, direction: -1 | 1): string[] | null {
  const target = index + direction
  if (index < 0 || index >= keys.length || target < 0 || target >= keys.length) return null
  const next = [...keys]
  ;[next[index], next[target]] = [next[target] as string, next[index] as string]
  return next
}
