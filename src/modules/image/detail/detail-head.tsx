import { useTranslations } from 'next-intl'

import type { PhotoItem } from '../photos/photo-item'
import { sizeLabel, tierName } from '../workspace/workspace-options'
import { PhotoWhen } from './photo-when'

// Name in the display face, then "Today 14:05 · Post 4:5 · Standard · 2 credits".
export function DetailHead({ item }: { item: PhotoItem }) {
  const t = useTranslations('app')
  return (
    <header>
      <h1 className="font-display text-title leading-none tracking-[-0.02em] lg:text-[40px]">{item.templateName}</h1>
      <p className="mt-1.5 text-caption text-muted-foreground">
        <PhotoWhen iso={item.createdAt} variant="meta" />
        {' · '}
        <span className="font-mono text-bone-dim">{sizeLabel(item.aspect, t)}</span>
        {' · '}
        {tierName(item.resolution, t)}
        {' · '}
        <span className="font-mono text-bone-dim">{t('credits', { count: item.credits })}</span>
      </p>
    </header>
  )
}
