import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import type { Balance } from '../../billing'
import type { PurchaseLine } from '../../billing/documents/lines'
import { PlanCard, planAllowance, type LastMembership, type SubscriptionSummary } from '../../billing/subscription'
import type { SiteProduct } from '../../config'
import { TabRootHeader } from '../../app-shell'
import { fileUrlFor, type MonthWorks } from '../../jobs'
import type { LinkStatus } from '../../partner'
import { IntegrationsPanel } from '../../partner/ui'
import { CreditDials } from './credit-dials'
import { FilmStrip } from './film-strip'
import { Group } from './rows'
import { SessionRows } from './session-rows'
import { SettingsRows } from './settings-rows'

// /account (comps-v3-b/account.html, SIGN-OFF row 08, T39 + T48): the membership pass, the
// credit dials and this month's film strip (side by side from md), then plain rows. Everything
// is read by app/ in one parallel round; the server actions come from app/ too.

export type AccountData = {
  email: string | null
  // A phone sign-up's number, masked (140****5678); null for email and Google accounts (T63).
  phone: string | null
  balance: Balance
  // Same-IP rule (ARCHITECTURE §7): this account got no signup gift.
  giftRefused: boolean
  subscription: SubscriptionSummary
  // When the account was made, and the newest membership purchase (from the payments list).
  since: Date | null
  lastMembership: LastMembership | null
  works: MonthWorks
  purchases: readonly PurchaseLine[]
  // The payments read hit its page size, so the row says "20+".
  morePurchases: boolean
  helpUnread: boolean
  graylum: LinkStatus
  // profiles.role = 'admin': the "Admin" row (spec #186).
  admin: boolean
}

export type AccountActions = {
  manageSubscription: () => Promise<void>
  // A Waffo card subscription is cancelled with our own button (T50).
  cancelWaffoSubscription: () => Promise<{ ok: boolean }>
  disconnectGraylum: () => Promise<void>
  signOut: () => Promise<void>
}

// What the page needs from site.config (core never imports site/).
export type AccountSite = {
  products: readonly SiteProduct[]
  brand: string
  // The signup gift, the free dial's "of 6".
  freeCredits: number
}

type Props = { data: AccountData; actions: AccountActions; site: AccountSite; children?: ReactNode }

// Who is signed in: the email, or the masked phone of an account that has none.
export function AccountHeader({ email }: { email?: string | null }) {
  const t = useTranslations('auth.account')
  const who = email ? (
    <span title={email} className="block max-w-[52vw] truncate text-caption leading-none text-muted-foreground tabular-nums md:max-w-80">
      {email}
    </span>
  ) : undefined
  return <TabRootHeader title={t('title')} aside={who} />
}

// The pass and the credits share a row from md (3 : 2), as in the comp.
const pair = 'md:mx-0 md:mt-0 md:max-w-none'

export function AccountView({ data, actions, site, children }: Props) {
  const t = useTranslations('app.account')
  const facts = { since: data.since, email: data.email, brand: site.brand, last: data.lastMembership }
  const allowance = planAllowance(data.subscription, data.lastMembership)
  return (
    <>
      <AccountHeader email={data.email ?? data.phone} />
      <div className="md:mx-(--gutter) md:mt-6 md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start md:gap-4">
        <Group title={t('plan.title')} className={pair}>
          <PlanCard summary={data.subscription} products={site.products} paid={data.balance.paid} manage={actions.manageSubscription} cancelWaffo={actions.cancelWaffoSubscription} facts={facts} />
        </Group>
        <Group title={t('credits.title')} className={pair}>
          <CreditDials balance={data.balance} giftRefused={data.giftRefused} allowance={allowance} freeGift={site.freeCredits} />
          <FilmStrip ids={data.works.ids} count={data.works.count} fileUrl={fileUrlFor} />
        </Group>
      </div>
      {children}
      <Group title={t('settings.title')}>
        <SettingsRows email={data.email} phone={data.phone} purchases={data.purchases} morePurchases={data.morePurchases} helpUnread={data.helpUnread} admin={data.admin} />
      </Group>
      <IntegrationsPanel graylum={data.graylum} disconnect={actions.disconnectGraylum} />
      <Group title={t('session.title')} hideTitle>
        <SessionRows signOut={actions.signOut} />
      </Group>
    </>
  )
}
