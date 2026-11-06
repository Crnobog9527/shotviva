import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { MembershipTier, SiteProduct } from '../../config'
import { usdFormat } from '../paywall/offer'
import type { LastMembership } from './membership-facts'
import { Acts, Flag, Muted, Pass, PassName, PaywallPill, PortalButton, richTags, Since, Status, Why } from './plan-parts'
import type { SubscriptionSummary } from './summary'

// Account page membership pass (comps-v3-b/account.html with ?sub=active|cancelled|expired|
// past_due|wallet, DESIGN §4.5): what the subscriptions mirror and paid_until say, worded as
// what happens next, with one button for the one thing to do. Card subscriptions go to the
// Stripe Customer Portal; one-period (Alipay / Waffo) members renew through the paywall.

export type PassFacts = {
  // When the account was made ("Since Nov 2026").
  since: Date | null
  email: string | null
  // The word mark debossed into the card (site.config brand name).
  brand: string
  // The newest membership purchase, for the one-period card and the ended plan's name.
  last: LastMembership | null
}

type Props = {
  summary: SubscriptionSummary
  products: readonly SiteProduct[]
  // Paid credits left: the expired card says they still work.
  paid: number
  manage: () => Promise<void>
  facts: PassFacts
}

type Subscribed = Extract<SubscriptionSummary, { kind: 'subscription' }>
type Ctx = { manage: Props['manage']; facts: PassFacts; products: Props['products']; paid: number }

function useNames() {
  const tiers = useTranslations('paywall.tiers')
  const t = useTranslations('app.account.plan')
  const format = useFormatter()
  return {
    tier: (tier: MembershipTier | null) => (tier ? tiers(tier) : t('member')),
    month: (date: Date | null) => (date ? format.dateTime(date, { month: 'short', year: 'numeric' }) : null),
    usd: (amount: number) => format.number(amount, usdFormat(amount)),
  }
}

function SinceFoot({ facts, withEmail = false, children }: { facts: PassFacts; withEmail?: boolean; children: ReactNode }) {
  const t = useTranslations('app.account.plan')
  const month = useNames().month(facts.since)
  const value = [month, withEmail ? facts.email : null].filter(Boolean).join(' · ')
  return (
    <>
      {value ? <Since label={t('since')}>{value}</Since> : <span />}
      <Acts>{children}</Acts>
    </>
  )
}

// "50 credits a month · $19.90/mo", from the product the mirror row names.
function PerPeriod({ summary, products }: { summary: Subscribed; products: Props['products'] }) {
  const t = useTranslations('app.account.plan')
  const usd = useNames().usd
  const product = products.find((p) => p.tier === summary.tier && p.interval === summary.interval)
  if (!product || product.priceUsd <= 0) return null
  return <Muted>{t.rich('perPeriod', { ...richTags, credits: product.credits, interval: summary.interval, price: usd(product.priceUsd) })}</Muted>
}

function SubscribedPass({ summary, ctx }: { summary: Subscribed; ctx: Ctx }) {
  const t = useTranslations('app.account.plan')
  const name = useNames().tier(summary.tier)
  const date = summary.periodEnd
  const manage = <PortalButton manage={ctx.manage}>{t('manage')}</PortalButton>
  const pass = (state: string, status: ReactNode, body: ReactNode, foot: ReactNode) => (
    <Pass state={state} tier={summary.tier} brand={ctx.facts.brand} head={<><span>{t('member')}</span>{status}</>} foot={foot}>
      <PassName>{name}</PassName>
      {body}
    </Pass>
  )
  if (summary.state === 'cancels') {
    const acts = <PortalButton manage={ctx.manage} main>{t('resubscribe')}</PortalButton>
    return pass('cancelled', <Status>{t('endsPlain', { date })}</Status>, <Why>{t.rich('cancelledWhy', { ...richTags, date })}</Why>, <SinceFoot facts={ctx.facts}>{acts}{manage}</SinceFoot>)
  }
  if (summary.state === 'past_due') {
    const update = <PortalButton manage={ctx.manage} main external>{t('updatePayment')}</PortalButton>
    const foot = <><Since label={t('opensStripeTop')}>{t('opensStripeBottom')}</Since><Acts>{update}{manage}</Acts></>
    return pass('past_due', <Flag bad>{t('paymentFailed')}</Flag>, <Why>{summary.expired ? t('pastDueEndedWhy') : t('pastDueWhy')}</Why>, foot)
  }
  if (summary.state === 'paused') {
    return pass('paused', <Flag>{t('paused')}</Flag>, <Why>{t('pausedWhy')}</Why>, <SinceFoot facts={ctx.facts}>{manage}</SinceFoot>)
  }
  const foot = <SinceFoot facts={ctx.facts} withEmail>{manage}</SinceFoot>
  return pass('active', <Status>{t('renewsPlain', { date })}</Status>, <PerPeriod summary={summary} products={ctx.products} />, foot)
}

// Alipay / Waffo: one period paid once. The newest membership purchase says which period and
// how it was paid when it is the tier the account has now.
function WalletPass({ summary, ctx }: { summary: Extract<SubscriptionSummary, { kind: 'paid_until' }>; ctx: Ctx }) {
  const t = useTranslations('app.account.plan')
  const names = useNames()
  const date = summary.paidUntil
  const last = ctx.facts.last && ctx.facts.last.product.tier === summary.tier ? ctx.facts.last : null
  const why =
    last?.method === 'alipay'
      ? t.rich('walletAlipayWhy', { ...richTags, interval: last.product.interval, method: t('alipay'), date })
      : t('walletWhy', { date })
  const options = summary.tier ? { tier: summary.tier, period: last?.product.interval } : undefined
  const renew = last && last.product.priceUsd > 0 ? t.rich('renewPrice', { ...richTags, price: names.usd(last.product.priceUsd) }) : t('renew')
  return (
    <Pass state="wallet" tier={summary.tier} brand={ctx.facts.brand} head={<><span>{t('member')}</span><Status>{t('endsPlain', { date })}</Status></>} foot={<SinceFoot facts={ctx.facts}><PaywallPill main options={options}>{renew}</PaywallPill></SinceFoot>}>
      <PassName>{names.tier(summary.tier)}</PassName>
      <Why>{why}</Why>
    </Pass>
  )
}

function NoPlanPass({ summary, ctx }: { summary: Extract<SubscriptionSummary, { kind: 'expired' | 'free' }>; ctx: Ctx }) {
  const t = useTranslations('app.account.plan')
  const names = useNames()
  const expired = summary.kind === 'expired'
  const lead = ctx.facts.last ? t('endedTier', { tier: names.tier(ctx.facts.last.product.tier) }) : t('endedPlain')
  const status = expired ? <Flag>{t('ended', { date: summary.paidUntil })}</Flag> : null
  const acts = (
    <>
      <PaywallPill main>{t('choosePlan')}</PaywallPill>
      {expired ? <PaywallPill options={{ step: 'packs' }}>{t('buyCredits')}</PaywallPill> : null}
    </>
  )
  return (
    <Pass state={expired ? 'expired' : 'free'} tier={null} brand={ctx.facts.brand} head={<><span>{t('member')}</span>{status}</>} foot={<SinceFoot facts={ctx.facts}>{acts}</SinceFoot>}>
      <PassName>{t('noPlan')}</PassName>
      <Why>{expired ? <>{lead} {t.rich('expiredRest', { ...richTags, paid: ctx.paid })}</> : t('freeWhy')}</Why>
    </Pass>
  )
}

export function PlanCard({ summary, products, paid, manage, facts }: Props) {
  const ctx: Ctx = { manage, facts, products, paid }
  if (summary.kind === 'subscription') return <SubscribedPass summary={summary} ctx={ctx} />
  if (summary.kind === 'paid_until') return <WalletPass summary={summary} ctx={ctx} />
  return <NoPlanPass summary={summary} ctx={ctx} />
}
