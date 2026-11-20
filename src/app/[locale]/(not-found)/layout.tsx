import '../../globals-public.css'

import { AnnouncementBanner } from '@/core/announcements'
import { currentLocale } from '@/core/i18n/server'
import { NoLinkPrefetch } from '@/core/i18n/ui'
import { LivingBackground } from '@/core/ui/living-background'

import { MarketingFooter, MarketingHeader } from '../marketing-chrome'

export default async function NotFoundLayout({ children }: { children: React.ReactNode }) {
  const locale = await currentLocale()
  return (
    <NoLinkPrefetch>
      <AnnouncementBanner />
      <MarketingHeader locale={locale} homeOnly />
      <main className="flex flex-1 flex-col">{children}</main>
      <MarketingFooter locale={locale} homeOnly />
      <LivingBackground />
    </NoLinkPrefetch>
  )
}
