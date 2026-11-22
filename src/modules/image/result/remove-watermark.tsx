import { useTranslations } from 'next-intl'

import { Link } from '@/core/i18n/ui'
import { buttonVariants } from '@/core/ui/button'

import { removeWatermarkHref } from '../again/again-start'

// Next to every free work its owner sees (Owner 2026-11-22): 「去水印：用付费积分重新生成」. It is
// Make again on the work's own settings and kept photo, with only paid credits allowed to pay; the
// workspace's primary turns into "Get credits" (the paywall) when they do not cover it. No prefetch:
// opening it copies the kept photo back (makeAgainHref).
export function RemoveWatermark({ templateId, jobId }: { templateId: string; jobId: string }) {
  const t = useTranslations('app.result')
  return (
    <div className="grid gap-1">
      <Link href={removeWatermarkHref(templateId, jobId)} prefetch={false} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'w-full' })}>
        {t('removeWatermark')}
      </Link>
      <p className="text-caption leading-[1.4] text-muted-foreground">{t('removeWatermarkNote')}</p>
    </div>
  )
}
