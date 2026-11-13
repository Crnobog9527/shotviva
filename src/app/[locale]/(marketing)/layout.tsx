// The public pages' Tailwind sheet, first so its layers and tokens precede every component sheet
// (the root layout carries none: marketing and sign-in pages get this one, the app globals.css).
import '../../globals-public.css'

import { AnnouncementBanner } from '@/core/announcements'
import { currentLocale } from '@/core/i18n/server'
import { NoLinkPrefetch } from '@/core/i18n/ui'
import { LivingBackground } from '@/core/ui/living-background'

import { MarketingFooter, MarketingHeader } from '../marketing-chrome'
import './legal.css'

// Marketing shell (DESIGN §6.9 items 4–5): the site announcement over the top bar (whose globe
// carries the 「切换到中文？」 hint, ARCHITECTURE §17), the page, the footer (§10). The living
// background (DESIGN §5, T54) mounts under it all after first paint.
export default async function MarketingLayout({ children }: LayoutProps<'/[locale]'>) {
  const locale = await currentLocale()
  // Public pages load a link on the click only (core/i18n/ui/link-prefetch.tsx: mainland China).
  return (
    <NoLinkPrefetch>
      <AnnouncementBanner />
      <MarketingHeader locale={locale} />
      <main className="flex flex-1 flex-col">{children}</main>
      <MarketingFooter locale={locale} />
      <LivingBackground />
    </NoLinkPrefetch>
  )
}
