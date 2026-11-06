/* eslint-disable @next/next/no-img-element -- auth-gated download route, not a static asset */
import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

// The photo being edited, tagged "This photo": a 120px strip in the phone drawer, a 4:5 plate
// (at most 520px tall) in the desktop dialog's left column (T6 comp).
export function EditPhoto({ src, className }: { src: string; className?: string }) {
  const t = useTranslations('app.edit')
  return (
    <div className={cn('hairline relative overflow-hidden rounded-panel bg-photo-ground', className)}>
      <img src={src} alt="" className="size-full object-cover" />
      <span className="frost absolute bottom-3 left-3 inline-flex min-h-7 items-center rounded-full px-3 text-caption leading-none font-medium text-photo-ink">
        {t('thisPhoto')}
      </span>
    </div>
  )
}
