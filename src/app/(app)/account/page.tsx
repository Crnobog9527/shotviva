import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, BalanceChip, balanceSentence, TabRootHeader } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { DeleteAccountPanel } from '@/core/auth/ui'
import { readBalance, type Balance } from '@/core/billing'
import { CheckoutNotice, PaywallButton } from '@/core/billing/paywall'
import { readSubscriptionSummary, SubscriptionPanel, type SubscriptionSummary } from '@/core/billing/subscription'
import { readLinkStatus } from '@/core/partner'
import { GraylumConnection } from '@/core/partner/ui'
import { buttonVariants } from '@/core/ui/button'
import { site } from '@/site/site.config'

import { signOutAction } from '../../auth/actions'
import { disconnectGraylumAction } from './partner-actions'
import { manageSubscriptionAction } from './subscription-actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.account'))('metaTitle') }
}

type ViewProps = { email: string | null; balance: Balance; graylumLinkedAt: Date | null; subscription: SubscriptionSummary }

function Panel({ children }: { children: ReactNode }) {
  return <section className="hairline-lit mx-4 mt-4 rounded-panel bg-card p-4">{children}</section>
}

function AccountHeader() {
  return <TabRootHeader title={useTranslations('auth.account')('title')} />
}

function AccountView({ email, balance, graylumLinkedAt, subscription }: ViewProps) {
  const t = useTranslations('auth.account')
  const balanceT = useTranslations('app.balance')
  return (
    <>
      <TabRootHeader title={t('title')} aside={<BalanceChip balance={balance} />} />
      <p className="px-4 pt-3 text-caption text-muted-foreground">{t('signedInAs', { email: email ?? '' })}</p>
      <Suspense fallback={null}>
        <CheckoutNotice returnToHosts={site.partners.graylum.returnToHosts} />
      </Suspense>
      <Panel>
        <h2 className="text-headline leading-[1.25] font-semibold">{balanceT('panelTitle')}</h2>
        <p className="mt-2 text-body text-bone-dim">{balanceSentence(balance, balanceT)}</p>
        <PaywallButton trigger="account" className="mt-1 inline-flex min-h-11 items-center gap-1 font-medium">
          {balanceT('getCredits')}
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </PaywallButton>
      </Panel>
      <Panel>
        <SubscriptionPanel summary={subscription} manage={manageSubscriptionAction} />
      </Panel>
      <Panel>
        <GraylumConnection linkedAt={graylumLinkedAt} disconnect={disconnectGraylumAction} />
      </Panel>
      <form action={signOutAction} className="mx-4 mt-6">
        <button type="submit" className={buttonVariants({ variant: 'glass', size: 'touch', className: 'w-full' })}>
          {t('signOut')}
        </button>
      </form>
      <div className="mx-4 mt-3">
        <DeleteAccountPanel />
      </div>
    </>
  )
}

async function Account() {
  const user = await requireUser('/account')
  const supabase = await createServerSupabase()
  const [graylum, balance, subscription] = await Promise.all([
    readLinkStatus(supabase, user.id),
    readBalance(supabase, user.id),
    readSubscriptionSummary(createAdminSupabase(), user.id, site.billing.products),
  ])
  return <AccountView email={user.email} balance={balance} graylumLinkedAt={graylum.linkedAt} subscription={subscription} />
}

export default function AccountPage() {
  return (
    <AppPage>
      <Suspense fallback={<AccountHeader />}>
        <Account />
      </Suspense>
    </AppPage>
  )
}
