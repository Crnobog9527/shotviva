import { useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { requireUser } from '@/core/auth'
import { DeleteAccountPanel } from '@/core/auth/ui'

import { signOutAction } from '../../auth/actions'

function AccountView({ email }: { email: string | null }) {
  const t = useTranslations('auth.account')
  return (
    <section className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-sm">{t('signedInAs', { email: email ?? '' })}</p>
      <form action={signOutAction}>
        <button type="submit" className="h-12 w-full rounded-md border border-neutral-300 text-base">
          {t('signOut')}
        </button>
      </form>
      <h2 className="text-lg font-semibold">{t('dangerZone')}</h2>
      <DeleteAccountPanel />
    </section>
  )
}

async function Account() {
  const user = await requireUser('/account')
  return <AccountView email={user.email} />
}

export default function AccountPage() {
  return (
    <Suspense>
      <Account />
    </Suspense>
  )
}
