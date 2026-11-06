'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode, type RefObject } from 'react'

import { CameraIcon } from './home-icons'

// `cost`: the picked template's Standard price, shown once a photo is in ("Generate · 2 credits",
// home.html dock); null before a template is known.
type Props = { watch: readonly RefObject<HTMLElement | null>[]; hasPhoto: boolean; cost: number | null; onClick(): void }

const costTag = (chunks: ReactNode) => <span className="mk-cost-tag">{chunks}</span>

function DockLabel({ hasPhoto, cost }: Pick<Props, 'hasPhoto' | 'cost'>) {
  const t = useTranslations('home.generator')
  const app = useTranslations('app.workspace')
  if (!hasPhoto) return <>{t('uploadPhoto')}</>
  if (cost === null) return <>{t('dockGenerate')}</>
  return <>{app.rich('generateCta', { cost: costTag, count: cost })}</>
}

// The generator's primary, floating, shown only while no generator is on screen and the footer
// is not either (v3-b comp "dock"): the two are never visible together. Taps bring the
// generator back; nothing is charged from here.
export function HomeDock({ watch, hasPhoto, cost, onClick }: Props) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const footer = document.querySelector('footer')
    const seen = new Map<Element, boolean>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) seen.set(entry.target, entry.isIntersecting)
      const generatorVisible = watch.some((ref) => ref.current && seen.get(ref.current) && ref.current.offsetParent !== null)
      setShow(!generatorVisible && !(footer && seen.get(footer)))
    })
    for (const ref of watch) if (ref.current) observer.observe(ref.current)
    if (footer) observer.observe(footer)
    return () => observer.disconnect()
  }, [watch])
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
