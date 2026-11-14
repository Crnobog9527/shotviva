import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'

// The old poster list (ARCHITECTURE §5.3): poster templates now open as a dialog on Create, so
// this address goes to Create, which signs a visitor in first.
async function ToCreate(): Promise<null> {
  redirect(localizePath('/generate', await currentLocale()))
}

export default function PostersPage() {
  return (
    <Suspense fallback={null}>
      <ToCreate />
    </Suspense>
  )
}
