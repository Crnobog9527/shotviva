import { Suspense } from 'react'

import { requireUser } from '@/core/auth'
import { UpdatePasswordForm } from '@/core/auth/ui'

import { updatePasswordAction } from '../../../auth/actions'

// The recovery link signs the visitor in via /auth/confirm before landing here.
async function UpdatePassword() {
  await requireUser('/reset/update')
  return <UpdatePasswordForm action={updatePasswordAction} />
}

export default function UpdatePasswordPage() {
  return (
    <Suspense>
      <UpdatePassword />
    </Suspense>
  )
}
