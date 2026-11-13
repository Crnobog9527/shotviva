import type { InquiryStatus } from '@/core/inquiries/rules'
import { Badge } from '@/core/ui/badge'

import { INQUIRIES_COPY as COPY } from './copy'

export function StatusBadge({ status }: { status: InquiryStatus }) {
  return <Badge variant={status === 'new' ? 'default' : 'secondary'}>{COPY.statuses[status]}</Badge>
}
