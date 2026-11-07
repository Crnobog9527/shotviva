'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { CameraIcon } from './home-icons'

// `cost`: the picked template's Standard price, shown once a photo is in ("Generate · 2 credits",
// home.html dock); null before a template is known.
type Props = { show: boolean; hasPhoto: boolean; cost: number | null; onClick(): void }

const costTag = (chunks: ReactNode) => <span className="mk-cost-tag">{chunks}</span>

function DockLabel({ hasPhoto, cost }: Pick<Props, 'hasPhoto' | 'cost'>) {
  const t = useTranslations('home.generator')
  const app = useTranslations('app.workspace')
  if (!hasPhoto) return <>{t('uploadPhoto')}</>
  if (cost === null) return <>{t('dockGenerate')}</>
  return <>{app.rich('generateCta', { cost: costTag, count: cost })}</>
}

// The generator's primary, floating, phones only (below 768px; the header's button takes over
// from there, use-header-upload): shown while no generator is on screen and the footer is not
// either (v3-b comp "dock"), so the two are never visible together. Taps bring the generator
// back; nothing is charged from here.
export function HomeDock({ show, hasPhoto, cost, onClick }: Props) {
  return (
    <div className={show ? 'mk-dock mk-dock-show' : 'mk-dock'} aria-hidden={!show}>
      <button type="button" className="mk-cta" tabIndex={show ? 0 : -1} onClick={onClick}>
        <CameraIcon />
        <span>
          <DockLabel hasPhoto={hasPhoto} cost={cost} />
        </span>
      </button>
    </div>
  )
}
