import type { ImageRef } from '@/core/content'
import { OUTPUT_ASPECTS } from '@/core/templates/output-options'

// Shared bits of the three landing pages (T44): the illustrative hero pairs in public/home
// (example-*, 900 × 1125) and the size count.
export const pairImage = (file: string, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width: 900, height: 1125 })
export const homeImage = (file: string, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width: 1080, height: 1350 })
// The inner pages' own cases (public/cases, 1080 × 1350, Owner 2026-11-11): a sneaker shoot on
// /commercial-photography; a cat in three art styles and four precise edits on
// /image-to-image-generator. None of them repeats the home page's tote.
export const caseImage = (file: string, alt: string): ImageRef => ({ src: `/cases/${file}.webp`, alt, width: 1080, height: 1350 })

// "eight sizes"
export const SIZE_COUNT = OUTPUT_ASPECTS.length
export const sizeCountWord = (['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const)[SIZE_COUNT] ?? String(SIZE_COUNT)

// The category keys a landing page's template section shows (template_categories.key, which
// never changes, T75); the templates in them are the admin's featured ones (T53). A key the
// Owner deletes in admin simply shows nothing.
export const CATEGORY = { food: 'food-drink', products: 'products-resale', beauty: 'beauty-skincare' } as const
