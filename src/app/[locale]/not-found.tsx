import { currentLocale } from '@/core/i18n/server'

import { MarketingFooter, MarketingHeader } from './marketing-chrome'
import { NotFoundContent } from './not-found-content'

// notFound() anywhere under [locale] (an unknown template, an unknown inner page), in the
// page's language, inside the marketing shell. In-app misses (a photo that is not there) have
// their own state next to the page.
export default async function NotFound() {
  const locale = await currentLocale()
  return (
    <>
      <MarketingHeader locale={locale} />
      <main className="flex flex-1 flex-col">
        <NotFoundContent locale={locale} />
      </main>
      <MarketingFooter locale={locale} />
    </>
  )
}
