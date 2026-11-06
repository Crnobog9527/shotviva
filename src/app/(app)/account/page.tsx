import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, BalanceChip, balanceSentence, TabRootHeader } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser, signupGiftRefused } from '@/core/auth'
import { DeleteAccountPanel } from '@/core/auth/ui'
import { readBalance, type Balance } from '@/core/billing'
import { CheckoutNotice, PaywallButton } from '@/core/billing/paywall'
import { readSubscriptionSummary, SubscriptionPanel, type SubscriptionSummary } from '@/core/billing/subscription'
import { readLinkStatus, type LinkStatus } from '@/core/partner'
import { IntegrationsPanel } from '@/core/partner/ui'
import { hasUnreadReply } from '@/core/support'
import { HelpEntry } from '@/core/support/ui'
import { buttonVariants } from '@/core/ui/button'
import { site } from '@/site/site.config'

import { signOutAction } from '../../auth/actions'
import { disconnectGraylumAction } from './partner-actions'
import { manageSubscriptionAction } from './subscription-actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.account'))('metaTitle') }
}

type ViewProps = {
  email: string | null
  balance: Balance
  graylum: LinkStatus
  subscription: SubscriptionSummary
  helpUnread: boolean
  // Same-IP rule (ARCHITECTURE §7): this account got no signup gift.
  giftRefused: boolean
}

function Panel({ children }: { children: ReactNode }) {
  return <section className="hairline-lit mx-4 mt-4 rounded-panel bg-card p-4">{children}</section>
}

function AccountHeader() {
  return <TabRootHeader title={useTranslations('auth.account')('title')} />
}

function AccountView({ email, balance, graylum, subscription, helpUnread, giftRefused }: ViewProps) {
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
        {giftRefused ? <p className="mt-2 text-caption text-muted-foreground">{balanceT('signupGiftRefused')}</p> : null}
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
        <IntegrationsPanel graylum={graylum} disconnect={disconnectGraylumAction} />
      </Panel>
      <Panel>
        <HelpEntry unread={helpUnread} />
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
  const admin = createAdminSupabase()
  const [graylum, balance, subscription, giftRefused, helpUnread] = await Promise.all([
    readLinkStatus(supabase, user.id),
    readBalance(supabase, user.id),
    readSubscriptionSummary(admin, user.id, site.billing.products),
    signupGiftRefused(admin, user.id, site.billing.freeCredits),
    hasUnreadReply(supabase, user.id),
  ])
  return (
    <AccountView
      email={user.email}
      balance={balance}
      graylum={graylum}
      subscription={subscription}
      helpUnread={helpUnread}
      giftRefused={giftRefused}
    />
  )
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
