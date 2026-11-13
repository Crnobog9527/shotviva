/* eslint-disable @next/next/no-img-element -- the optimiser's srcset on a plain <img> (coverImage), fitted whole */
import { useTranslations } from 'next-intl'

import { coverImage } from '@/core/ui/cover-image'

import type { CatalogueTemplate } from '../../catalogue/catalogue-template'

type Props = { cover: CatalogueTemplate['cover'] | null; name: string }

// The poster dialog's sample: the template's cover pages side by side, whole (a poster is tall,
// so it is fitted, never cropped). Nothing when the template has no cover yet.
export function PosterSample({ cover, name }: Props) {
  const t = useTranslations('app.poster')
  const pages = [cover?.before, cover?.after].filter((src): src is string => Boolean(src))
  if (pages.length === 0) return <span className="hairline block aspect-[8/5] rounded-control bg-muted max-md:h-full" />
  return (
    <div className="flex aspect-[8/5] justify-center gap-2 rounded-control bg-wash-faint p-2 max-md:h-full max-md:aspect-auto">
      {pages.map((src, i) => (
        <img key={src} {...coverImage(src, '(min-width: 768px) 240px, 45vw')} alt={t('sampleAlt', { name, page: i + 1 })} className="h-full min-w-0 rounded-inner object-contain" />
      ))}
    </div>
  )
}
