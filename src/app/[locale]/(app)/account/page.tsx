import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'

import { AppPage } from '@/core/app-shell'
import { AccountHeader, AccountView, InviteCard, RedeemCard, STRIP_FRAMES } from '@/core/account/ui'
import { createAdminSupabase, createServerSupabase, requireUser, signupGiftRefused } from '@/core/auth'
import { maskPhone } from '@/core/auth/phone'
import { readPendingDiscount } from '@/core/codes/server'
import { readBalance } from '@/core/billing'
import { purchaseLines } from '@/core/billing/documents'
import { lastMembership, readMemberSince, readSubscriptionSummary } from '@/core/billing/subscription'
import { listMonthWorks } from '@/core/jobs'
import { readLinkStatus } from '@/core/partner'
import { formatMoney, hasUnreadReply, listPaymentOptions, paymentChoices, PICKER_LIMIT, ReplyTime } from '@/core/support'
import { AccountHelp } from '@/core/support/ui/account'
import { currentLocale } from '@/core/i18n/server'
import type { Translate } from '@/core/translate'
import { site } from '@/site/site.config'

import { actions, helpActions } from './account-actions'
import { loadMyInvites } from './invite-action'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.account'))('metaTitle') }
}

const accountSite = {
  products: site.billing.products,
  brand: site.brand.name,
  freeCredits: site.billing.freeCredits,
}

// One parallel round of reads: private tables (subscriptions, payments, the gift check) with
// the admin client filtered to this user, the rest with the user's own session.
async function Account() {
  const user = await requireUser('/account')
  const supabase = await createServerSupabase()
  const admin = createAdminSupabase()
  const [graylum, balance, subscription, giftRefused, helpUnread, payments, since, works, t, locale, discount] = await Promise.all([
    readLinkStatus(supabase, user.id),
    readBalance(supabase, user.id),
    readSubscriptionSummary(admin, user.id, site.billing.products),
    signupGiftRefused(admin, user.id, site.billing.freeCredits),
    hasUnreadReply(supabase, user.id),
    listPaymentOptions(admin, user.id),
    readMemberSince(admin, user.id),
    listMonthWorks(supabase, user.id, new Date(), STRIP_FRAMES),
    getTranslations('app.support'),
    currentLocale(),
    readPendingDiscount(admin, user.id),
  ])
  const purchases = paymentChoices(payments, site.billing.products, t as unknown as Translate, { money: formatMoney(locale) })
  const last = lastMembership(payments, site.billing.products)
  const more = payments.length >= PICKER_LIMIT
  // Each line with its receipt / invoice links (T80); the support picker keeps the plain labels.
  const lines = purchaseLines(payments, purchases, locale)
  const data = { email: user.email, phone: maskPhone(user.phone) || null, balance, giftRefused, subscription, since, lastMembership: last, works, purchases: lines, morePurchases: more, helpUnread, graylum, admin: user.role === 'admin' }
  // Help & feedback opens over the page (?help=…, T68); its payments picker is the Purchases list.
  return (
    <>
      <AccountView data={data} actions={actions} site={accountSite}>
        <InviteCard load={loadMyInvites} reward={site.growth.invite} />
        <RedeemCard pending={discount} />
      </AccountView>
      <AccountHelp actions={helpActions} payments={purchases} replyTime={<ReplyTime userId={user.id} />} brand={site.brand.name} unread={helpUnread} />
    </>
  )
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
