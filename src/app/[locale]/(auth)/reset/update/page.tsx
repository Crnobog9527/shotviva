import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { requireUser } from '@/core/auth'
import { UpdatePasswordForm } from '@/core/auth/ui'

import { updatePasswordAction } from '@/app/auth/actions'

// Sign-in pages are noindex like the rest of the app (建站规格 R6), in both languages, and carry
// no hreflang (ARCHITECTURE §17); the root template adds " | Shotviva" to the title.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth.update'))('title') }
}

// The recovery link signs the visitor in via /auth/confirm before landing here.
async function UpdatePassword() {
  const user = await requireUser('/reset/update')
  return <UpdatePasswordForm action={updatePasswordAction} email={user.email} />
}

export default function UpdatePasswordPage() {
  return (
    <Suspense>
      <UpdatePassword />
    </Suspense>
  )
}
