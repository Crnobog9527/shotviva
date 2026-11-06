import { useTranslations } from 'next-intl'
import { Suspense } from 'react'

import type { Balance } from '../../billing'
import { CheckoutNotice } from '../../billing/paywall'
import { PlanCard, type SubscriptionSummary } from '../../billing/subscription'
import type { SiteProduct } from '../../config'
import { TabRootHeader } from '../../app-shell'
import type { LinkStatus } from '../../partner'
import { IntegrationsPanel } from '../../partner/ui'
import { CreditsCells } from './credits-cells'
import { Group } from './rows'
import { SessionRows } from './session-rows'
import { SettingsRows } from './settings-rows'
import type { PurchaseLine } from './sheet-rows'

// /account (comps-v3-b/account.html, SIGN-OFF row 08): the plan, the balance, then plain rows.
// Everything is read by app/ in one parallel round; the server actions come from app/ too.

export type AccountData = {
  email: string | null
  balance: Balance
  // Same-IP rule (ARCHITECTURE §7): this account got no signup gift.
  giftRefused: boolean
  subscription: SubscriptionSummary
  purchases: readonly PurchaseLine[]
  // The payments read hit its page size, so the row says "20+".
  morePurchases: boolean
  helpUnread: boolean
  graylum: LinkStatus
}

export type AccountActions = {
  manageSubscription: () => Promise<void>
  disconnectGraylum: () => Promise<void>
  signOut: () => Promise<void>
}

type Props = {
  data: AccountData
  actions: AccountActions
  products: readonly SiteProduct[]
  // Graylum hosts the checkout notice may send a top-up buyer back to (site.config).
  returnToHosts: readonly string[]
}

export function AccountHeader({ email }: { email?: string | null }) {
  const t = useTranslations('auth.account')
  const who = email ? (
    <span title={email} className="block max-w-[52vw] truncate text-caption leading-none text-muted-foreground md:max-w-80">
      {email}
    </span>
  ) : undefined
  return <TabRootHeader title={t('title')} aside={who} />
}

export function AccountView({ data, actions, products, returnToHosts }: Props) {
  const t = useTranslations('app.account')
  return (
    <>
      <AccountHeader email={data.email} />
      <Suspense fallback={null}>
        <CheckoutNotice returnToHosts={returnToHosts} />
      </Suspense>
      <Group title={t('plan.title')}>
        <PlanCard summary={data.subscription} products={products} paid={data.balance.paid} manage={actions.manageSubscription} />
      </Group>
      <Group title={t('credits.title')}>
        <CreditsCells balance={data.balance} giftRefused={data.giftRefused} />
      </Group>
      <Group title={t('settings.title')}>
        <SettingsRows email={data.email} purchases={data.purchases} morePurchases={data.morePurchases} helpUnread={data.helpUnread} />
      </Group>
      <IntegrationsPanel graylum={data.graylum} disconnect={actions.disconnectGraylum} />
      <Group title={t('session.title')} hideTitle>
        <SessionRows signOut={actions.signOut} />
      </Group>
    </>
  )
}
