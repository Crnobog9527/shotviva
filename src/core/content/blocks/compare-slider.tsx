'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useState, type CSSProperties } from 'react'

import type { ImageRef } from '../page-content'

type Props = { before: ImageRef; after: ImageRef; label: string; sizes: string }

// The one draggable compare left on the site: Art Styles (DESIGN §6.9 item 1). A native range
// input carries the drag, so keyboard and screen readers get it for free; the seam nudges once
// on pointer hover (marketing.css), never under reduced motion.
export function CompareSlider({ before, after, label, sizes }: Props) {
  const t = useTranslations('marketing.home')
  const [x, setX] = useState(50)
  return (
    <div className="mk-compare" style={{ '--x': `${x}%` } as CSSProperties}>
      <Image className="mk-b" src={before.src} alt={before.alt} width={before.width} height={before.height} sizes={sizes} loading="lazy" />
      <Image className="mk-after" src={after.src} alt={after.alt} width={after.width} height={after.height} sizes={sizes} loading="lazy" />
      <span className="mk-handle" aria-hidden>
        <span />
      </span>
      <span className="mk-tag mk-tag-l" aria-hidden>
        {t('phone')}
      </span>
      <span className="mk-tag mk-tag-r" aria-hidden>
        {t('ai')}
      </span>
      <span className="mk-illus">{t('illustrative')}</span>
      <input type="range" min={0} max={100} value={x} onChange={(event) => setX(Number(event.target.value))} aria-label={label} />
    </div>
  )
}
