import { useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { createServerSupabase, requireUser } from '@/core/auth'
import { DeleteAccountPanel } from '@/core/auth/ui'
import { readLinkStatus } from '@/core/partner'
import { GraylumConnection } from '@/core/partner/ui'

import { signOutAction } from '../../auth/actions'
import { disconnectGraylumAction } from './partner-actions'

function AccountView({ email, graylumLinkedAt }: { email: string | null; graylumLinkedAt: Date | null }) {
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
      <GraylumConnection linkedAt={graylumLinkedAt} disconnect={disconnectGraylumAction} />
      <h2 className="text-lg font-semibold">{t('dangerZone')}</h2>
      <DeleteAccountPanel />
    </section>
  )
}

async function Account() {
  const user = await requireUser('/account')
  const graylum = await readLinkStatus(await createServerSupabase(), user.id)
  return <AccountView email={user.email} graylumLinkedAt={graylum.linkedAt} />
}

export default function AccountPage() {
  return (
    <Suspense>
      <Account />
    </Suspense>
  )
}
