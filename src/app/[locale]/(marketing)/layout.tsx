import { Suspense } from 'react'

import { AnnouncementBanner } from '@/core/announcements'
import { currentLocale } from '@/core/i18n/server'
import { SwitchBanner } from '@/core/i18n/ui'
import { site } from '@/site/site.config'

import { MarketingFooter, MarketingHeader } from '../marketing-chrome'
import './legal.css'

// Marketing shell (DESIGN §6.9 items 4–5): the 「切换到中文」 suggestion and the site
// announcement over the top bar, the page, the footer (ARCHITECTURE §10, §17).
export default async function MarketingLayout({ children }: LayoutProps<'/[locale]'>) {
  const locale = await currentLocale()
  return (
    <>
      <Suspense fallback={null}>
        <SwitchBanner translatedPaths={site.locales.zhPaths} />
      </Suspense>
      <AnnouncementBanner />
      <MarketingHeader locale={locale} />
      <main className="flex flex-1 flex-col">{children}</main>
      <MarketingFooter locale={locale} />
    </>
  )
}
