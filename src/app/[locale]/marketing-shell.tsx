import type { ReactNode } from 'react'

import { AnnouncementBanner } from '@/core/announcements'
import { currentLocale } from '@/core/i18n/server'
import { NoLinkPrefetch } from '@/core/i18n/ui'
import { LivingBackground } from '@/core/ui/living-background'

import { MarketingFooter, MarketingHeader } from './marketing-chrome-content'

export async function MarketingShell({ children }: { children: ReactNode }) {
  const locale = await currentLocale()
  return (
    <NoLinkPrefetch>
      <AnnouncementBanner checkPath={false} />
      <MarketingHeader locale={locale} />
      <main className="flex flex-1 flex-col">{children}</main>
      <MarketingFooter locale={locale} />
      <LivingBackground />
    </NoLinkPrefetch>
  )
}
