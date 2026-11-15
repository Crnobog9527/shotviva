import type { Resolution } from '@/core/templates/output-options'
import type { CreditsFloor, TemplateQuality } from '@/core/templates/pricing'

import { marginNote } from './tier-price'

type Props = { floor: CreditsFloor; quality: TemplateQuality; resolution: Resolution; price: string; slots?: number }

// 「最坏毛利 X%（目标 60%）」 under a tier's price; yellow below the target, never a refusal (1568).
export function MarginNote({ floor, quality, resolution, price, slots }: Props) {
  const note = marginNote(floor, quality, resolution, price, slots)
  if (!note) return null
  return (
    <p data-margin-low={note.low ? 'true' : undefined}
      className={note.low ? 'text-xs font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground text-xs'}>
      {note.text}
    </p>
  )
}
