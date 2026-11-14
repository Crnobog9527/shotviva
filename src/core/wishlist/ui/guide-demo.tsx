'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { useMediaQuery } from '../../ui/use-media-query'
import { DEMO_NOW, demoCard, type DemoCopy, type GuideStep } from './guide-demo-card'
import { WallCard } from './wall-card'

// How long the vote step waits before the example vote goes in, so the user sees 51 first.
const TICK_MS = 750

const ignore = () => {}

// One step's picture in the teaching sheet (Owner 2026-11-11): the wall's real card, playing
// that step by itself: pinned up as a fresh wish, voted 51 → 52, then stamped shipped with its
// template link. The card is inert (a picture, not controls). A hidden copy in its shipped
// state holds the plate's height, so the sheet does not jump between steps. Under reduced
// motion each step shows its end state at once (wishlist.css).
export function GuideDemo({ step, visit }: { step: GuideStep; visit: number }) {
  const t = useTranslations('app.wishlist.guide')
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [ticked, setTicked] = useState(-1)
  useEffect(() => {
    if (step !== 'vote') return
    const timer = setTimeout(() => setTicked(visit), TICK_MS)
    return () => clearTimeout(timer)
  }, [step, visit])
  const voted = step === 'vote' && (reduce || ticked === visit)
  const copy: DemoCopy = { description: t('example'), author: t('exampleAuthor'), template: t('exampleTemplate') }
  return (
    <div className="wl-guide-plate" data-step={step} aria-hidden="true" inert>
      <div className="wl-demo">
        <div className="wl-demo-sizer">
          <WallCard card={demoCard('ship', true, copy)} canVote now={DEMO_NOW} onVote={ignore} demo />
        </div>
        <div className="wl-demo-card">
          <WallCard card={demoCard(step, voted, copy)} canVote now={DEMO_NOW} onVote={ignore} demo />
        </div>
      </div>
    </div>
  )
}
