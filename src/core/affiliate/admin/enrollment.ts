import { slugSchema } from '../enrollment'
import { COPY, STATUS } from './copy'

// Same namespace and UUID format as affiliate_apply. Generate only for a new enrollment.
export const newAffiliateSlug = () => 'sv-' + crypto.randomUUID().replaceAll('-', '').slice(0, 20)
export const writableSlug = slugSchema.refine((s) => !['admin', 'api', 'www', 'shotviva', 'partners', 'support'].includes(s))

export function enrollmentLabel(row: { status: string; source: unknown }) {
  return row.status === 'pending' && row.source === 'admin_invite' ? COPY.invited : STATUS[row.status]
}
