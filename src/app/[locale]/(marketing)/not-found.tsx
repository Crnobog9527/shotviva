import { currentLocale } from '@/core/i18n/server'

import { NotFoundContent } from '../not-found-content'

// notFound() in a marketing page (an unknown landing page, a gallery work that is not shown): the
// 404 body inside the marketing layout, which brings the announcement, header, footer and the
// stylesheets. The boundary itself imports none, so pages do not carry a second copy of them in
// their HTML (inlineCss puts every boundary's stylesheets into every page that has the boundary).
export default async function MarketingNotFound() {
  return <NotFoundContent locale={await currentLocale()} />
}
