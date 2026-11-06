import type { ImageRef } from '@/core/content'
import { OUTPUT_ASPECTS } from '@/core/templates/output-options'

// Shared bits of the three landing pages (T44): the illustrative hero pairs in public/home
// (example-*, 900 × 1125) and the size count.
export const pairImage = (file: string, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width: 900, height: 1125 })
export const homeImage = (file: string, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width: 1080, height: 1350 })

// "eight sizes"
export const SIZE_COUNT = OUTPUT_ASPECTS.length
export const sizeCountWord = (['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const)[SIZE_COUNT] ?? String(SIZE_COUNT)

// The §5 category names a landing page's template section shows (templates.category, matched
// case-insensitively); the templates in them are the admin's featured ones (T53).
export const CATEGORY = { food: 'Food & Drink', products: 'Products & Resale', beauty: 'Beauty & Skincare' } as const
