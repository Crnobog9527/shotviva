import type { ImageRef, TemplateCategory } from '@/core/content'
import { OUTPUT_ASPECTS } from '@/core/templates/output-options'

// Shared bits of the three landing pages (T44): the illustrative hero pairs from
// public/home/templates (900 × 1125) and the size count.
export const pairImage = (file: string, alt: string): ImageRef => ({ src: `/home/templates/${file}.webp`, alt, width: 900, height: 1125 })
export const homeImage = (file: string, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width: 1080, height: 1350 })

// "eight sizes"
export const SIZE_COUNT = OUTPUT_ASPECTS.length
export const sizeCountWord = (['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const)[SIZE_COUNT] ?? String(SIZE_COUNT)

// The featured categories by position (ARCHITECTURE §5 order, same in both languages).
export const CATEGORY = { art: 0, food: 1, products: 2, beauty: 3, rooms: 4, pets: 5 } as const

export function pickCategories(all: readonly TemplateCategory[], keys: readonly (keyof typeof CATEGORY)[]): readonly [TemplateCategory, ...TemplateCategory[]] {
  const [first, ...rest] = keys.map((key) => all[CATEGORY[key]]).filter((category): category is TemplateCategory => category !== undefined)
  if (!first) throw new Error('pickCategories: no such category')
  return [first, ...rest]
}
