'use client'

import { PageErrorView, type PageErrorProps } from '../page-error-view'

// An error inside a marketing page: the panel inside the marketing layout (banner, header,
// footer and its stylesheets stay). Errors in the layout itself fall to [locale]/error.tsx.
export default function MarketingError(props: PageErrorProps) {
  return <PageErrorView {...props} />
}
