import { effectiveStillCover } from '@/core/templates/client'
import { coverImage } from '@/core/ui/cover-image'
import { cn } from '@/core/ui/cn'

import type { AdminTemplate } from '../templates/types'
import { rowCopy } from './copy'

type Props = {
  template: Pick<AdminTemplate, 'coverAfterUrl' | 'coverLocales'>
  // Tailwind size classes; the image optimiser is asked for this many CSS pixels.
  className: string
  px: number
}

// The template's "after" cover as the Chinese pages show it (the admin is Chinese, DESIGN §7),
// through the image optimiser at the size it is drawn: a stored cover is up to 1600 px, the
// catalogue has dozens of rows. A template without one shows a quiet placeholder, not a gap.
export function TemplateThumb({ template, className, px }: Props) {
  const url = effectiveStillCover(template.coverLocales, 'zh', 'after', template.coverAfterUrl)
  const box = cn('bg-muted shrink-0 overflow-hidden rounded-md', className)
  if (!url) {
    return (
      <span className={cn(box, 'text-muted-foreground flex items-center justify-center text-[10px]')}>{rowCopy.noCover}</span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- coverImage() supplies the optimiser's srcset
    <img {...coverImage(url, `${px}px`)} alt="" loading="lazy" decoding="async" draggable={false} className={cn(box, 'object-cover')} />
  )
}
