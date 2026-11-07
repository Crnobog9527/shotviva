'use client'

import { lazy, Suspense } from 'react'

import { publicEnv } from '../../public-env'
import { useAfterLoad, useConsent } from './use-consent'

// The bar's own code is a separate chunk, fetched only by a visitor who sees it (T70): most
// visitors never download it, and no page's first-load JS grows.
const ConsentBar = lazy(() => import('./consent-bar'))

// Rendered once by the root layout. Without a PostHog key there is nothing to consent to.
export function ConsentSlot() {
  const { mode } = useConsent()
  const ready = useAfterLoad()
  if (!publicEnv.NEXT_PUBLIC_POSTHOG_KEY) return null
  if (mode === 'hidden' || (mode === 'ask' && !ready)) return null
  return (
    <Suspense fallback={null}>
      <ConsentBar mode={mode} />
    </Suspense>
  )
}
