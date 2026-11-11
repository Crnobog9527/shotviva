import { NotFoundView, TryTemplates } from '@/core/content'
import type { Locale } from '@/core/i18n'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { cachedPublicSeries } from '@/core/templates/public-series'
import { tryTemplates } from '@/site/content'

// The 404 body for every place one is rendered: the message, the way home, and three
// templates to try instead (design/comps-v3-b/404.html). The catalogue read is cached.
export async function NotFoundContent({ locale }: { locale: Locale }) {
  const [live, series] = await Promise.all([cachedWebCatalogue(locale), cachedPublicSeries(locale)])
  return <NotFoundView templates={<TryTemplates templates={tryTemplates(live, series)} />} />
}
