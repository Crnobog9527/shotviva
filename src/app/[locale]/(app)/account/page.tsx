import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'

import { hasAffiliateDashboard } from '@/core/affiliate/feature'
import { AppPage } from '@/core/app-shell'
import { AccountHeader, AccountView, InviteCard, RedeemCard, STRIP_FRAMES } from '@/core/account/ui'
import { createAdminSupabase, createServerSupabase, requireUser, readSignupGift } from '@/core/auth'
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
import { contractProducts, displayProducts } from '@/site/billing/display-products'
import { site } from '@/site/site.config'

import { actions, helpActions } from './account-actions'
import { loadMyInvites } from './invite-action'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.account'))('metaTitle') }
}

// One parallel round of reads: private tables (subscriptions, payments, the gift check) with
// the admin client filtered to this user, the rest with the user's own session.
async function Account() {
  const user = await requireUser('/account')
  const supabase = await createServerSupabase()
  const admin = createAdminSupabase()
  const history = contractProducts(admin)
  const [graylum, balance, subscription, signupGift, helpUnread, payments, since, works, t, locale, discount, affiliate, offers, identities] = await Promise.all([
    readLinkStatus(supabase, user.id),
    readBalance(supabase, user.id),
    history.then(products => readSubscriptionSummary(admin, user.id, products)),
    readSignupGift(admin, user.id, site.billing.freeCredits),
    hasUnreadReply(supabase, user.id),
    listPaymentOptions(admin, user.id),
    readMemberSince(admin, user.id),
    listMonthWorks(admin, user.id, new Date(), STRIP_FRAMES),
    getTranslations('app.support'),
    currentLocale(),
    readPendingDiscount(admin, user.id),
    hasAffiliateDashboard(user.id),
    displayProducts(),
    history,
  ])
  const purchases = paymentChoices(payments, identities, t as unknown as Translate, { money: formatMoney(locale) })
  const last = lastMembership(payments, identities)
  const more = payments.length >= PICKER_LIMIT
  // Each line with its receipt / invoice links (T80); the support picker keeps the plain labels.
  const lines = purchaseLines(payments, purchases, locale)
  const data = { email: user.email, phone: maskPhone(user.phone) || null, balance, giftRefused: signupGift.reason, subscription, since, lastMembership: last, works, purchases: lines, morePurchases: more, helpUnread, graylum, affiliate, admin: user.role === 'admin' }
  // Help & feedback opens over the page (?help=…, T68); its payments picker is the Purchases list.
  return (
    <>
      <AccountView data={data} actions={actions} site={{ brand: site.brand.name, products: offers, freeCredits: signupGift.granted }}>
        <InviteCard load={loadMyInvites} />
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
