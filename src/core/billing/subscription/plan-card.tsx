import { useFormatter, useTranslations } from 'next-intl'

import type { MembershipTier, SiteProduct } from '../../config'
import { usdFormat } from '../paywall/offer'
import { Acts, Flag, Muted, PaywallPill, PlanHead, PlanShell, PortalButton, richTags, Why } from './plan-parts'
import type { SubscriptionSummary } from './summary'

// Account page Plan card (comps-v3-b/account.html with ?sub=active|cancelled|expired|past_due|
// wallet, DESIGN §4.5): what the subscriptions mirror and paid_until say, worded as what happens
// next, with one button for the one thing to do. Card subscriptions go to the Stripe Customer
// Portal; one-period (Alipay / Waffo) members renew through the paywall.

type Props = {
  summary: SubscriptionSummary
  products: readonly SiteProduct[]
  // Paid credits left: the expired card says they still work.
  paid: number
  manage: () => Promise<void>
}

type Subscribed = Extract<SubscriptionSummary, { kind: 'subscription' }>

function useTierName() {
  const tiers = useTranslations('paywall.tiers')
  const t = useTranslations('app.account.plan')
  return (tier: MembershipTier | null) => (tier ? tiers(tier) : t('member'))
}

// "50 credits a month · $19.90/mo", from the product the mirror row names.
function PerPeriod({ summary, products }: { summary: Subscribed; products: Props['products'] }) {
  const t = useTranslations('app.account.plan')
  const format = useFormatter()
  const product = products.find((p) => p.tier === summary.tier && p.interval === summary.interval)
  if (!product || product.priceUsd <= 0) return null
  const price = format.number(product.priceUsd, usdFormat(product.priceUsd))
  return <Muted>{t.rich('perPeriod', { ...richTags, credits: product.credits, interval: summary.interval, price })}</Muted>
}

function SubscribedCard({ summary, products, manage }: { summary: Subscribed; products: Props['products']; manage: Props['manage'] }) {
  const t = useTranslations('app.account.plan')
  const name = useTierName()(summary.tier)
  const date = summary.periodEnd
  const manageButton = <PortalButton manage={manage}>{t('manage')}</PortalButton>
  if (summary.state === 'cancels') {
    return (
      <PlanShell state="cancelled">
        <PlanHead name={name} tier={summary.tier} aside={<Muted>{t.rich('ends', { ...richTags, date })}</Muted>} />
        <Why>{t.rich('cancelledWhy', { ...richTags, date })}</Why>
        <Acts>
          <PortalButton manage={manage} main>
            {t('resubscribe')}
          </PortalButton>
          {manageButton}
        </Acts>
      </PlanShell>
    )
  }
  if (summary.state === 'past_due') {
    return (
      <PlanShell state="past_due">
        <PlanHead name={name} tier={summary.tier} aside={<Flag bad>{t('paymentFailed')}</Flag>} />
        <Why>{summary.expired ? t('pastDueEndedWhy') : t('pastDueWhy')}</Why>
        <Acts>
          <PortalButton manage={manage} main external>
            {t('updatePayment')}
          </PortalButton>
          {manageButton}
        </Acts>
        <Muted>{t('opensStripe')}</Muted>
      </PlanShell>
    )
  }
  if (summary.state === 'paused') {
    return (
      <PlanShell state="paused">
        <PlanHead name={name} tier={summary.tier} aside={<Flag>{t('paused')}</Flag>} />
        <Why>{t('pausedWhy')}</Why>
        <Acts>{manageButton}</Acts>
      </PlanShell>
    )
  }
  return (
    <PlanShell state="active">
      <PlanHead name={name} tier={summary.tier} aside={<Muted>{t.rich('renews', { ...richTags, date })}</Muted>} />
      <PerPeriod summary={summary} products={products} />
      <Acts>{manageButton}</Acts>
    </PlanShell>
  )
}

function UnsubscribedCard({ summary, paid }: { summary: Exclude<SubscriptionSummary, Subscribed>; paid: number }) {
  const t = useTranslations('app.account.plan')
  const tierName = useTierName()
  if (summary.kind === 'paid_until') {
    const date = summary.paidUntil
    return (
      <PlanShell state="wallet">
        <PlanHead name={tierName(summary.tier)} tier={summary.tier} aside={<Muted>{t.rich('ends', { ...richTags, date })}</Muted>} />
        <Why>{t('walletWhy', { date })}</Why>
        <Acts>
          <PaywallPill main options={summary.tier ? { step: 'period', tier: summary.tier } : undefined}>
            {t('renew')}
          </PaywallPill>
        </Acts>
      </PlanShell>
    )
  }
  const expired = summary.kind === 'expired'
  return (
    <PlanShell state={expired ? 'expired' : 'free'}>
      <PlanHead name={t('noPlan')} tier={null} aside={expired ? <Flag>{t('ended', { date: summary.paidUntil })}</Flag> : null} />
      <Why>{expired ? t.rich('expiredWhy', { ...richTags, paid }) : t('freeWhy')}</Why>
      <Acts>
        <PaywallPill main>{t('choosePlan')}</PaywallPill>
        {expired ? <PaywallPill options={{ step: 'packs' }}>{t('buyCredits')}</PaywallPill> : null}
      </Acts>
    </PlanShell>
  )
}

export function PlanCard({ summary, products, paid, manage }: Props) {
  return summary.kind === 'subscription' ? (
    <SubscribedCard summary={summary} products={products} manage={manage} />
  ) : (
    <UnsubscribedCard summary={summary} paid={paid} />
  )
}
