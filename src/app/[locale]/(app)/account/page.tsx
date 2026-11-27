import type { Metadata } from 'next'
import { Suspense, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { enterpriseCustomerLink, hasAffiliateDashboard } from '@/core/affiliate/feature'
import { AppPage } from '@/core/app-shell'
import { readInviteSummary } from '@/core/account/codes'
import { AccountHeader, AccountView, GiftClaimCard, InviteCard, RedeemCard, STRIP_FRAMES } from '@/core/account/ui'
import { Group, RowsPanel } from '@/core/account/ui/rows'
import { createAdminSupabase, createServerSupabase, readClaimOptions, readSignupGift, requireUser } from '@/core/auth'
import { maskPhone } from '@/core/auth/phone'
import { readPendingDiscount } from '@/core/codes/server'
import { readBalance } from '@/core/billing'
import { purchaseLines } from '@/core/billing/documents'
import { lastMembership, readMemberSince, readSubscriptionSummary } from '@/core/billing/subscription'
import { listMonthWorks } from '@/core/jobs'
import { serverEnv } from '@/core/env'
import { readOrgView } from '@/core/org/console'
import { CustomerLinkRow, MemberEntry, MemberLinkCallout, OwnerEntryRow } from '@/core/org/ui'
import { readLinkStatus } from '@/core/partner'
import { graylumIntroLinks } from '@/core/partner/ui'
import { formatMoney, hasUnreadReply, listPaymentOptions, paymentChoices, PICKER_LIMIT, ReplyTime } from '@/core/support'
import { StoreCard } from '@/core/store-profile/ui'
import { AccountHelp } from '@/core/support/ui/account'
import { currentLocale, localized } from '@/core/i18n/server'
import type { Translate } from '@/core/translate'
import { contractProducts, displayProducts } from '@/site/billing/display-products'
import { signupGiftCreditsForSite } from '@/site/billing/signup-gift'
import { site } from '@/site/site.config'

import { actions, helpActions } from './account-actions'
import { claimGoogleAction, claimPhoneSendAction, claimPhoneVerifyAction } from './claim-actions'
import { loadMyInvites } from './invite-action'
import { loadStoreProfile, saveStoreProfileAction } from './store-actions'

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
  const [graylum, balance, subscription, signupGift, helpUnread, payments, since, works, t, locale, discount, affiliate, offers, identities, org] = await Promise.all([
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
    readOrgView(user.id, { db: admin, maskPhone }),
  ])
  // 1480: an account over the per-network allowance can still claim its signup gift.
  const claimOptions = signupGift.reason === 'same_ip_pending' ? await readClaimOptions(admin) : null
  // What a claim pays now: the admin's amount (2008), which claim_signup_gift reads when it pays.
  const claimCredits = claimOptions ? await signupGiftCreditsForSite() : 0
  const purchases = paymentChoices(payments, identities, t as unknown as Translate, { money: formatMoney(locale) })
  const last = lastMembership(payments, identities)
  const more = payments.length >= PICKER_LIMIT
  // Each line with its receipt / invoice links (T80); the support picker keeps the plain labels.
  const lines = purchaseLines(payments, purchases, locale)
  const data = { email: user.email, phone: maskPhone(user.phone) || null, balance, giftRefused: signupGift.reason, subscription, since, lastMembership: last, works, purchases: lines, morePurchases: more, helpUnread, graylum, graylumLinks: graylumIntroLinks(serverEnv().VERCEL_ENV), affiliate, admin: user.role === 'admin' }
  // Help & feedback opens over the page (?help=…, T68); its payments picker is the Purchases list.
  return (
    <>
      <AccountView data={data} actions={actions} site={{ brand: site.brand.name, products: offers, freeCredits: signupGift.granted }}>
        {claimOptions ? <GiftClaimCard credits={claimCredits} options={claimOptions} actions={claimActions} /> : null}
        <OrgBlock view={org} memberLink={org.kind === 'member' ? <Suspense fallback={null}><MemberLink user={user.id} /></Suspense> : null} customerLink={org.kind === 'owner' && org.org.affiliateEnabled && affiliate ? <Suspense fallback={null}><OwnerCustomerLink user={user.id} /></Suspense> : null} />
        <StoreCard actions={storeActions} />
        {/* 2032: an org staff code earns no personal invite rewards; members promote with the org link above. */}
        {!orgInvites(org) && <InviteCard load={loadMyInvites} />}
        <RedeemCard pending={discount} />
      </AccountView>
      <AccountHelp actions={helpActions} payments={purchases} replyTime={<ReplyTime userId={user.id} />} brand={site.brand.name} unread={helpUnread} />
    </>
  )
}

// With the org's affiliate switch on, a member's (and the owner's) invite code is an org code: no
// personal invitee or inviter reward (2032), so the personal invite card would promise rewards that
// do not come. They promote with the org's links instead.
function orgInvites(view: Awaited<ReturnType<typeof readOrgView>>) {
  return (view.kind === 'member' || view.kind === 'owner') && (view.kind === 'member' ? view.affiliateEnabled : view.org.affiliateEnabled)
}

// The enterprise block (ARCHITECTURE §6.5, card E4): the owner gets a row into their console, a
// member a row into their own org page with what is left of this month's credits, then their
// promotion link (Owner 2026-11-23); everyone else sees nothing.
function OrgBlock({ view, customerLink, memberLink }: { view: Awaited<ReturnType<typeof readOrgView>>; customerLink: ReactNode; memberLink: ReactNode }) {
  const t = useTranslations('app.org.entry')
  const format = useFormatter()
  if (view.kind === 'owner') {
    const pool = format.number(view.org.poolCredits)
    return (
      <Group title={t('title')}>
        <RowsPanel>
          <OwnerEntryRow name={view.org.name} pool={pool} suspended={view.org.status === 'suspended'} affiliate={customerLink !== null} />
        </RowsPanel>
        {customerLink}
      </Group>
    )
  }
  if (view.kind === 'member') {
    return (
      <Group title={t('title')}>
        <MemberEntry data={view} />
        {memberLink}
      </Group>
    )
  }
  return null
}

// Streams in after the rest of the page: the org owner's customer link, when the program is on.
async function OwnerCustomerLink({ user }: { user: string }) {
  const url = await enterpriseCustomerLink(user)
  return url ? <CustomerLinkRow url={url} /> : null
}

// Streams in too: a member's promotion link, their own invite code on the page's language.
async function MemberLink({ user }: { user: string }) {
  const summary = await readInviteSummary(createAdminSupabase(), user, site.growth.invite.inviterRewardCap).catch(() => null)
  return summary ? <MemberLinkCallout path={await localized('/?code=' + summary.code)} /> : null
}

const storeActions = { load: loadStoreProfile, save: saveStoreProfileAction }
const claimActions = { sendCode: claimPhoneSendAction, verifyCode: claimPhoneVerifyAction, google: claimGoogleAction }

export default function AccountPage() {
  return (
    <AppPage wide>
      <Suspense fallback={<AccountHeader />}>
        <Account />
      </Suspense>
    </AppPage>
  )
}
