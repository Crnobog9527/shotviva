'use client'

import { useTranslations } from 'next-intl'

import { CameraIcon } from './home-icons'

// The dock only brings the generator back, so it says "Upload photo" or "Generate" and never a
// price (Owner 2026-11-13: drop "· 20 credits" from the floating button); the generator's own
// primary shows the cost.
type Props = { show: boolean; canStartWithoutPicking: boolean; onClick(): void }

function DockLabel({ canStartWithoutPicking }: Pick<Props, 'canStartWithoutPicking'>) {
  const t = useTranslations('home.generator')
  return <>{canStartWithoutPicking ? t('dockGenerate') : t('uploadPhoto')}</>
}

// The generator's primary, floating, phones only (below 768px; the header's button takes over
// from there, use-header-upload): shown while no generator is on screen and the footer is not
// either (v3-b comp "dock"), so the two are never visible together. Taps bring the generator
// back; nothing is charged from here.
export function HomeDock({ show, canStartWithoutPicking, onClick }: Props) {
  return (
    <div className={show ? 'mk-dock mk-dock-show' : 'mk-dock'} aria-hidden={!show}>
      <button type="button" className="mk-cta" tabIndex={show ? 0 : -1} onClick={onClick}>
        <CameraIcon />
        <span>
          <DockLabel canStartWithoutPicking={canStartWithoutPicking} />
        </span>
      </button>
    </div>
  )
}
