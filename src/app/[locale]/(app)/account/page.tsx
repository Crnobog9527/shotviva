import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AccountHeader, AccountView, STRIP_FRAMES } from '@/core/account/ui'
import { AppPage } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser, signupGiftRefused } from '@/core/auth'
import { maskPhone } from '@/core/auth/phone'
import { readBalance } from '@/core/billing'
import { purchaseLines } from '@/core/billing/documents'
import { lastMembership, readMemberSince, readSubscriptionSummary } from '@/core/billing/subscription'
import { listMonthWorks } from '@/core/jobs'
import { readLinkStatus } from '@/core/partner'
import { formatMoney, hasUnreadReply, listPaymentOptions, paymentChoices, PICKER_LIMIT, ReplyTime } from '@/core/support'
import { HelpDialog, type HelpActions } from '@/core/support/ui'
import { currentLocale } from '@/core/i18n/server'
import type { Translate } from '@/core/translate'
import { site } from '@/site/site.config'

import { signOutAction } from '@/app/auth/actions'
import { addMessageAction, createTicketAction, loadMyTicketsPage, loadTicketThread, loadWorkChoices } from './help-actions'
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

const helpActions: HelpActions = {
  create: createTicketAction,
  addMessage: addMessageAction,
  loadTickets: loadMyTicketsPage,
  loadThread: loadTicketThread,
  loadWorks: loadWorkChoices,
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
    currentLocale(),
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
      <AccountView data={data} actions={actions} site={accountSite} />
      <HelpDialog actions={helpActions} payments={purchases} replyTime={<ReplyTime userId={user.id} />} brand={site.brand.name} unread={helpUnread} />
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
