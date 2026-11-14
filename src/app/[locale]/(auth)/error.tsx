'use client'

import { PageErrorView, type PageErrorProps } from '../page-error-view'

// An error inside a sign-in page: the panel inside the sign-in layout (its header, plate and
// footer stay). Errors in the layout itself fall to [locale]/error.tsx.
export default function AuthError(props: PageErrorProps) {
  return <PageErrorView {...props} />
}
