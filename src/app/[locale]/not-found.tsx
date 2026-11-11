// Rendered under the root layout alone, which carries no stylesheet of its own.
import '../globals-public.css'

import { AnnouncementBanner } from '@/core/announcements'
import { currentLocale } from '@/core/i18n/server'

import { MarketingFooter, MarketingHeader } from './marketing-chrome'
import { NotFoundContent } from './not-found-content'

// notFound() anywhere under [locale] (an unknown template, an unknown inner page), in the
// page's language, inside the marketing shell. In-app misses (a photo that is not there) have
// their own state next to the page. The site announcement sits over the top bar as on every
// marketing page (gap audit B13).
export default async function NotFound() {
  const locale = await currentLocale()
  return (
    <>
      <AnnouncementBanner />
      <MarketingHeader locale={locale} />
      <main className="flex flex-1 flex-col">
        <NotFoundContent locale={locale} />
      </main>
      <MarketingFooter locale={locale} />
    </>
  )
}
