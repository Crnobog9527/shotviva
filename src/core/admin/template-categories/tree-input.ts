import { z } from 'zod'

import { CATEGORY_KEY_PATTERN, categoryInputSchema } from '@/core/templates/categories'

const key = z.string().min(1).max(40).regex(CATEGORY_KEY_PATTERN)
export const nodeSchema = categoryInputSchema.extend({
  parentId: key.nullable().optional(),
  slug: key.optional(),
  isVisible: z.boolean().optional(),
  seoTitleEn: z.string().trim().max(200).optional(),
  seoTitleZh: z.string().trim().max(200).optional(),
  seoDescriptionEn: z.string().trim().max(500).optional(),
  seoDescriptionZh: z.string().trim().max(500).optional(),
})

export type NodeInput = z.infer<typeof nodeSchema>
export const moveSchema = z.object({ key, fromParent: key.nullable(), parentId: key.nullable(), beforeKey: key.nullable() })
