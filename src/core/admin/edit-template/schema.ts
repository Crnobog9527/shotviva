import { z } from 'zod'

import { creditsCostSchema } from '@/core/templates/pricing'
import { RESOLUTIONS, type Resolution } from '@/core/templates/output-options'
import { editParamsSchema } from '@/core/templates/edit-params'

// What /admin/templates/edit saves (ARCHITECTURE §5.2). Name, category, fields and surfaces of
// the built-in `edit` template are fixed in code; the Owner sets only these.
export const saveEditTemplateSchema = z.object({
  isActive: z.boolean(),
  creditsCost: creditsCostSchema,
  unpricedResolutions: z.array(z.enum(RESOLUTIONS)).max(3).optional(),
  // The wrapper that goes before the range paragraph and the user's words.
  wrapper: z.string().trim().min(1).max(20000),
  params: editParamsSchema,
})

export type SaveEditTemplateInput = z.input<typeof saveEditTemplateSchema>

// The editor's view of the template. `params` is what is stored, which an older or hand-edited
// row may not have in full; the editor fills the gaps with blanks.
export type EditTemplateSettings = {
  unpricedResolutions?: readonly Resolution[]
  saleEnabled: boolean
  providerId?: string | null
  isActive: boolean
  creditsCost: { '1k': number; '2k': number; '3k': number }
  quality: 'high' | 'medium'
  wrapper: string
  version: number
  params: Record<string, unknown>
}
