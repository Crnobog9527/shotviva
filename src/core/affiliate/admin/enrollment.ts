import { z } from 'zod'
import { affiliateStatus, slugSchema } from '../partners/models'
import { COPY, STATUS } from './copy'

// Same namespace and UUID format as affiliate_apply. Generate only for a new enrollment.
export const newAffiliateSlug = () => 'sv-' + crypto.randomUUID().replaceAll('-', '').slice(0, 20)
export const writableSlug = slugSchema.refine((s) => !['admin', 'api', 'www', 'shotviva', 'partners', 'support'].includes(s))

export const enrollmentRow = z.object({ slug: slugSchema, status: affiliateStatus, source: z.string().nullable() })
export type Enrollment = z.infer<typeof enrollmentRow>
export function enrollmentLabel(row: { status: string; source: unknown }) {
  return row.status === 'pending' && row.source === 'admin_invite' ? COPY.invited : STATUS[row.status]
}
