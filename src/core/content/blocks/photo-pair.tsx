import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { cn } from '../../ui/cn'
import type { ImageRef } from '../page-content'

type Props = {
  before: ImageRef
  after: ImageRef
  // 'lg': the hero and single-template rows (20px corners, labels on top); default: a card.
  size?: 'lg' | 'card'
  // The hero pair is the LCP element: preloaded, never lazy (建站规格 R9).
  preload?: boolean
  // Rendered width of the whole pair, for the image srcset.
  sizes: string
  className?: string
}

// The side-by-side pair (DESIGN §6.9 item 1): the phone photo on the left, the AI result on the
// right, one frame with a hairline between. On the right plate the phone photo sits under the
// result so the hover wipe (marketing.css) can develop one into the other; nothing depends on it.
export function PhotoPair({ before, after, size = 'card', preload = false, sizes, className }: Props) {
  const t = useTranslations('marketing.home')
  const loading = preload ? undefined : 'lazy'
  return (
    <span className={cn('mk-pair', size === 'lg' && 'mk-pair-lg', className)}>
      <span className="mk-pane">
        <Image className="mk-b" src={before.src} alt={before.alt} width={before.width} height={before.height} sizes={sizes} preload={preload} loading={loading} />
      </span>
      <span className="mk-pane">
        <Image className="mk-ph" src={before.src} alt="" aria-hidden width={before.width} height={before.height} sizes={sizes} loading="lazy" />
        <Image className="mk-a" src={after.src} alt={after.alt} width={after.width} height={after.height} sizes={sizes} preload={preload} loading={loading} />
        <span className="mk-ws" aria-hidden />
      </span>
      <span className="mk-hl" aria-hidden />
      <span className="mk-tag mk-tag-l" aria-hidden>
        {t('phone')}
      </span>
      <span className="mk-tag mk-tag-r" aria-hidden>
        {t('ai')}
      </span>
      <span className="mk-illus">{t('illustrative')}</span>
    </span>
  )
}
