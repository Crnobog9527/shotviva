import { z } from 'zod'

import { MAX_UPLOAD_BYTES } from '@/core/storage/rules'
import { CATEGORY_KEY_PATTERN } from '@/core/templates/categories'

export const uploadDescription = z.strictObject({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.int().positive().max(MAX_UPLOAD_BYTES),
  categoryId: z.string().max(40).regex(CATEGORY_KEY_PATTERN),
})
export const uploadCompletion = uploadDescription.extend({ uploadId: z.uuidv4() })
export const registeredReference = z.object({ id: z.uuid(), duplicate: z.boolean(), status: z.enum(['active', 'archived']) })
export const referenceTicket = z.object({ uploadId: z.uuidv4(), putUrl: z.url() })
export type RegisteredReference = z.infer<typeof registeredReference>
