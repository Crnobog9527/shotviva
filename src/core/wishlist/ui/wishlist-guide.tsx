'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Link } from '../../i18n/ui'
import { buttonVariants } from '../../ui/button'
import { ResponsiveSheet } from '../../ui/responsive-sheet'
import { GuideSteps } from './guide-steps'
import { guideAction } from './onboarding-rules'
import { useMarkOnce } from './use-mark-once'

type Props = { eligible: boolean; markSeen: () => Promise<void> }

// The first visit to the Wishlist (Owner 2026-11-10): a sheet with the three steps, shown once
// per account. The page renders this only while user_metadata.onboarding.wishlistSeen is unset,
// and opening it marks the flag, so the next visit (on any device) goes straight to the wall.
export function WishlistGuide({ eligible, markSeen }: Props) {
  const [open, setOpen] = useState(true)
  useMarkOnce(true, markSeen)
  return <GuideSheet open={open} onOpenChange={setOpen} eligible={eligible} />
}

type SheetProps = { open: boolean; onOpenChange(open: boolean): void; eligible: boolean }

// One primary: post a wish, or below the threshold make the photo that opens it (ARCHITECTURE
// §15.1). "Just looking" closes the sheet onto the wall.
function GuideSheet({ open, onOpenChange, eligible }: SheetProps) {
  const t = useTranslations('app.wishlist.guide')
  const action = guideAction(eligible)
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={t('title')} description={t('text')}>
      <GuideSteps />
      <div className="mt-4 grid gap-2">
        <Link href={action.href} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          {t(action.label)}
        </Link>
        <button type="button" onClick={() => onOpenChange(false)} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'min-h-12 rounded-control' })}>
          {t('later')}
        </button>
      </div>
    </ResponsiveSheet>
  )
}
