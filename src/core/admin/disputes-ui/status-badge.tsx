import { Badge } from '@/core/ui/badge'

import type { StatusTone } from './view-model'

// Urgent = we still have to submit; the rest are quiet so the one that needs the Owner stands out.
const VARIANT: Record<StatusTone, 'destructive' | 'secondary' | 'outline'> = {
  urgent: 'destructive',
  waiting: 'secondary',
  done: 'outline',
  lost: 'outline',
}

export function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  return <Badge variant={VARIANT[tone]}>{label}</Badge>
}
