import type { Metadata } from 'next'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AppPage, FlowNav } from '@/core/app-shell'
import { createServerSupabase, requireUser } from '@/core/auth'
import { listMyTickets, ReplyTime } from '@/core/support'
import { TicketsList } from '@/core/support/ui'
import { buttonVariants } from '@/core/ui/button'

import { loadMyTicketsPage } from './actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.support'))('title') }
}

// Help & feedback, a flow page under Account (noindex through the app layout). The reply time
// comes from the user's tier and the tier benefits (core/billing), never written here.
function Head() {
  const t = useTranslations('app.support')
  const account = useTranslations('auth.account')
  return (
    <>
      <FlowNav back={{ href: '/account', label: account('title') }} title={t('title')} />
      <h1 className="px-4 pt-2 font-display text-h1 leading-tight">{t('title')}</h1>
    </>
  )
}

async function Reply() {
  const user = await requireUser('/account/help')
  return (
    <p className="px-4 pt-2 text-body text-bone-dim">
      <ReplyTime userId={user.id} />
    </p>
  )
}

function NewTicket() {
  const t = useTranslations('app.support')
  return (
    <>
      <div className="px-4 pt-4">
        <Link href="/account/help/new" className={buttonVariants({ variant: 'cta', size: 'touch' })}>
          {t('newTicket')}
        </Link>
      </div>
      <h2 className="px-4 pt-8 pb-3 text-headline font-semibold">{t('mine')}</h2>
    </>
  )
}

async function Tickets() {
  const user = await requireUser('/account/help')
  const first = await listMyTickets(await createServerSupabase(), user.id)
  return <TicketsList first={first} loadMore={loadMyTicketsPage} />
}

export default function HelpPage() {
  return (
    <AppPage>
      <Head />
      <Suspense>
        <Reply />
      </Suspense>
      <NewTicket />
      <div className="px-4 pb-16">
        <Suspense>
          <Tickets />
        </Suspense>
      </div>
    </AppPage>
  )
}
