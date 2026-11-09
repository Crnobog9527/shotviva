import { z } from 'zod'

export const affiliateStatus = z.enum(['pending', 'active', 'rejected', 'suspended', 'banned'])
export const slugSchema = z.string().regex(/^[a-z0-9-]{3,24}$/)

export const enrollmentRow = z.object({ slug: slugSchema, status: affiliateStatus, source: z.string().nullable() })
export type Enrollment = z.infer<typeof enrollmentRow>
