'use client'

import { useTranslations } from 'next-intl'

import { usePathname } from '../i18n/navigation'
import { BarBoundary } from './bar-boundary'
import { ADMIN_COPY } from './copy'
import { useUpdateHold } from './holds'
import UpdateBar, { type UpdateCopy } from './update-bar'
import { useAppUpdate } from './use-app-update'

// The bar is imported statically, unlike the cookie bar: it shows exactly when this tab's build
// may be gone from the server, and a lazy chunk fetched then could be missing too (T90).

// The payment return page is part of the checkout flow: no banner there (T90).
const CHECKOUT_PATH = /^\/checkout(?:\/|$)/
const ADMIN_PATH = /^\/admin(?:\/|$)/

function useCopy(admin: boolean): UpdateCopy {
  const t = useTranslations('appUpdate')
  // The admin is Chinese only, whatever the address (DESIGN §7).
  if (admin) return ADMIN_COPY
  return { label: t('label'), body: t('body'), refresh: t('refresh'), close: t('close'), photosLost: t('photosLost') }
}

// Rendered once by the root layout, inside a Suspense (usePathname waits for the request on
// pages with request-time params): marketing pages, the app, the works pages and the admin.
export function UpdateSlot() {
  const pathname = usePathname()
  useUpdateHold('checkout', CHECKOUT_PATH.test(pathname))
  const copy = useCopy(ADMIN_PATH.test(pathname))
  const { view, refresh, dismiss } = useAppUpdate()
  if (!view.show) return null
  return (
    <BarBoundary label={copy.refresh}>
      <UpdateBar copy={copy} photosHeld={view.photosHeld} onRefresh={refresh} onDismiss={dismiss} />
    </BarBoundary>
  )
}
