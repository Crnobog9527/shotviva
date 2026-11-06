import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AccountHeader, AccountView, STRIP_FRAMES } from '@/core/account/ui'
import { AppPage } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser, signupGiftRefused } from '@/core/auth'
import { readBalance } from '@/core/billing'
import { lastMembership, readMemberSince, readSubscriptionSummary } from '@/core/billing/subscription'
import { listMonthWorks } from '@/core/jobs'
import { readLinkStatus } from '@/core/partner'
import { formatMoney, hasUnreadReply, listPaymentOptions, paymentChoices, PICKER_LIMIT } from '@/core/support'
import type { Translate } from '@/core/translate'
import { site } from '@/site/site.config'

import { signOutAction } from '@/app/auth/actions'
import { disconnectGraylumAction } from './partner-actions'
import { cancelWaffoSubscriptionAction, manageSubscriptionAction } from './subscription-actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.account'))('metaTitle') }
}

const accountSite = {
  products: site.billing.products,
  brand: site.brand.name,
  freeCredits: site.billing.freeCredits,
}

const actions = {
  manageSubscription: manageSubscriptionAction,
  cancelWaffoSubscription: cancelWaffoSubscriptionAction,
  disconnectGraylum: disconnectGraylumAction,
  signOut: signOutAction,
}

// One parallel round of reads: private tables (subscriptions, payments, the gift check) with
// the admin client filtered to this user, the rest with the user's own session.
async function Account() {
  const user = await requireUser('/account')
  const supabase = await createServerSupabase()
  const admin = createAdminSupabase()
  const [graylum, balance, subscription, giftRefused, helpUnread, payments, since, works, t, locale] = await Promise.all([
    readLinkStatus(supabase, user.id),
    readBalance(supabase, user.id),
    readSubscriptionSummary(admin, user.id, site.billing.products),
    signupGiftRefused(admin, user.id, site.billing.freeCredits),
    hasUnreadReply(supabase, user.id),
    listPaymentOptions(admin, user.id),
    readMemberSince(admin, user.id),
    listMonthWorks(supabase, user.id, new Date(), STRIP_FRAMES),
    getTranslations('app.support'),
    getLocale(),
  ])
  const purchases = paymentChoices(payments, site.billing.products, t as unknown as Translate, { money: formatMoney(locale) })
  const last = lastMembership(payments, site.billing.products)
  const more = payments.length >= PICKER_LIMIT
  const data = { email: user.email ?? null, balance, giftRefused, subscription, since, lastMembership: last, works, purchases, morePurchases: more, helpUnread, graylum }
  return <AccountView data={data} actions={actions} site={accountSite} />
}

export default function AccountPage() {
  return (
    <AppPage wide>
      <Suspense fallback={<AccountHeader />}>
        <Account />
      </Suspense>
    </AppPage>
  )
}
