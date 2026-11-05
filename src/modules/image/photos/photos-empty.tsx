'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { buttonVariants } from '@/core/ui/button'

import { useJobs } from '../generation/use-jobs'

// Empty Photos (DESIGN §4.6): one line and one button. Hidden while this tab has a photo
// developing that the server list did not include yet.
export function PhotosEmpty() {
  const t = useTranslations('app.photos')
  const developing = useJobs().some((job) => job.status === 'running')
  if (developing) return null
  return (
    <div className="mx-4 mt-10 grid justify-items-start gap-4">
      <p className="text-body text-bone-dim">{t('empty')}</p>
      <Link href="/generate" className={buttonVariants({ variant: 'cta', size: 'cta' })}>
        {t('emptyCta')}
      </Link>
    </div>
  )
}
