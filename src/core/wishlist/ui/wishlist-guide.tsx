'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { Link } from '../../i18n/ui'
import { buttonVariants } from '../../ui/button'
import { ResponsiveSheet } from '../../ui/responsive-sheet'
import { GUIDE_STEPS } from './guide-demo-card'
import { GuideSteps } from './guide-steps'
import { guideAction, startTour, tourDone, tourJump, tourNext, type Tour } from './onboarding-rules'
import { useMarkOnce } from './use-mark-once'

type Props = { eligible: boolean; markSeen: () => Promise<void> }

const COUNT = GUIDE_STEPS.length

// The first visit to the Wishlist (Owner 2026-11-10): a sheet with the three steps, shown once
// per account. The page renders this only while user_metadata.onboarding.wishlistSeen is unset.
// Since 2026-11-11 the user walks all three steps: "Next" until the last, no close button and
// no Escape or scrim until then, and the flag is marked only once the last step has been shown,
// so leaving half-way brings the sheet back on the next visit.
export function WishlistGuide({ eligible, markSeen }: Props) {
  const [open, setOpen] = useState(true)
  const [tour, setTour] = useState<Tour>(startTour)
  const done = tourDone(tour, COUNT)
  useMarkOnce(done, markSeen)
  const t = useTranslations('app.wishlist.guide')
  return (
    <ResponsiveSheet open={open} onOpenChange={setOpen} locked={!done} title={t('title')} description={t('text')}>
      <GuideSteps tour={tour} onJump={(step) => setTour((current) => tourJump(current, step))} />
      <GuideAction last={tour.step === COUNT - 1} eligible={eligible} onNext={() => setTour((current) => tourNext(current, COUNT))} />
    </ResponsiveSheet>
  )
}

type ActionProps = { last: boolean; eligible: boolean; onNext(): void }

// The one primary: "Next" through the steps, then on the last one post a wish, or below the
// threshold make the photo that opens it (ARCHITECTURE §15.1). When "Next" brings up the last
// step, focus moves onto the link that replaces it rather than falling back to the page.
function GuideAction({ last, eligible, onNext }: ActionProps) {
  const t = useTranslations('app.wishlist.guide')
  const action = guideAction(eligible)
  const fromNext = useRef(false)
  const className = buttonVariants({ variant: 'cta', size: 'cta', className: 'mt-4 w-full' })
  if (!last) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          fromNext.current = true
          onNext()
        }}
      >
        {t('next')}
      </button>
    )
  }
  const focusOnArrival = (element: HTMLAnchorElement | null) => {
    if (!element || !fromNext.current) return
    fromNext.current = false
    element.focus()
  }
  return (
    <Link href={action.href} className={className} ref={focusOnArrival}>
      {t(action.label)}
    </Link>
  )
}
