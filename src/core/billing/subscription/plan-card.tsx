import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { MembershipTier, SiteProduct } from '../../config'
import { usdFormat } from '../paywall/offer'
import type { LastMembership } from './membership-facts'
import { Acts, Flag, Muted, Pass, PassName, PaywallPill, PortalButton, richTags, Since, Status, Why } from './plan-parts'
import type { SubscriptionSummary } from './summary'
import { WaffoCancelButton, type CancelWaffoAction } from './waffo-cancel'

// Account page membership pass (comps-v3-b/account.html with ?sub=active|cancelled|expired|
// past_due|wallet, DESIGN §4.5): what the subscriptions mirror and paid_until say, worded as
// what happens next, with one button for the one thing to do. Stripe card subscriptions go to
// the Customer Portal; Waffo card subscriptions get our own Cancel button (T50); one-period
// (Alipay) members renew through the paywall.

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
  // Cancels the signed-in user's Waffo card subscription at period end (T50).
  cancelWaffo: CancelWaffoAction
  facts: PassFacts
  // false for org staff (Owner 2026-11-28): they buy nothing for themselves, so no buy button.
  buy?: boolean
}

type Subscribed = Extract<SubscriptionSummary, { kind: 'subscription' }>
type Ctx = { manage: Props['manage']; cancelWaffo: CancelWaffoAction; facts: PassFacts; products: Props['products']; paid: number; buy: boolean }

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

const METHOD_KEYS = { card: 'card', alipay: 'alipay', wechat_pay: 'wechatPay', cn_card: 'cnCard' } as const

// Historical grants come from the matched ledger entry.
function PerPeriod({ summary, ctx }: { summary: Subscribed; ctx: Ctx }) {
  const t = useTranslations('app.account.plan')
  const last = ctx.facts.last
  if (!last || last.product.id !== summary.productId) return null
  const method = t(METHOD_KEYS[last.method])
  return <Muted>{last.grantedCredits == null ? method : t('lastGrant', { credits: last.grantedCredits, method })}</Muted>
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
  return pass('active', <Status>{t('renewsPlain', { date })}</Status>, <PerPeriod summary={summary} ctx={ctx} />, foot)
}

// A Waffo card subscription (T50): the same states, but Waffo has no portal of ours. Active and
// past due offer "Cancel subscription"; a cancelled one simply runs to its end (Waffo cannot be
// resumed from here). Waffo retries a failed renewal once; a second failure ends the plan.
function WaffoPass({ summary, ctx }: { summary: Subscribed; ctx: Ctx }) {
  const t = useTranslations('app.account.plan')
  const name = useNames().tier(summary.tier)
  const date = summary.periodEnd
  const cancel = <WaffoCancelButton action={ctx.cancelWaffo} tierName={name} periodEnd={date} />
  const pass = (state: string, status: ReactNode, body: ReactNode, foot: ReactNode) => (
    <Pass state={state} tier={summary.tier} brand={ctx.facts.brand} head={<><span>{t('member')}</span>{status}</>} foot={foot}>
      <PassName>{name}</PassName>
      {body}
    </Pass>
  )
  if (summary.state === 'cancels') {
    return pass('cancelled', <Status>{t('endsPlain', { date })}</Status>, <Why>{t.rich('waffoCancelledWhy', { ...richTags, date })}</Why>, <SinceFoot facts={ctx.facts}>{null}</SinceFoot>)
  }
  if (summary.state === 'past_due') {
    const why = summary.expired ? t('waffoPastDueEndedWhy') : t('waffoPastDueWhy')
    return pass('past_due', <Flag bad>{t('paymentFailed')}</Flag>, <Why>{why}</Why>, <SinceFoot facts={ctx.facts}>{cancel}</SinceFoot>)
  }
  return pass('active', <Status>{t('renewsPlain', { date })}</Status>, <PerPeriod summary={summary} ctx={ctx} />, <SinceFoot facts={ctx.facts} withEmail>{cancel}</SinceFoot>)
}

const walletOf = (method: keyof typeof METHOD_KEYS) => (method === 'alipay' || method === 'wechat_pay' ? method : null)

// A card subscription of another tier that may still charge next to a one-period plan (the old
// plan's cancel failed after an upgrade): a secondary line, and its Manage / Cancel button.
function StillBillsLine({ other }: { other?: Subscribed }) {
  const t = useTranslations('app.account.plan')
  const names = useNames()
  if (!other) return null
  return <Muted>{t('stillBills', { tier: names.tier(other.tier), date: other.periodEnd })}</Muted>
}

function StillBillsAct({ other, ctx }: { other?: Subscribed; ctx: Ctx }) {
  const t = useTranslations('app.account.plan')
  const names = useNames()
  if (!other) return null
  const name = names.tier(other.tier)
  if (other.provider === 'waffo') return <WaffoCancelButton action={ctx.cancelWaffo} tierName={name} periodEnd={other.periodEnd} />
  return <PortalButton manage={ctx.manage}>{t('manage')}</PortalButton>
}

// Alipay (Stripe or Waffo) or WeChat Pay (Stripe, T73): one period paid once. The newest membership purchase says which period and
// how it was paid when it is the tier the account has now.
function WalletPass({ summary, ctx }: { summary: Extract<SubscriptionSummary, { kind: 'paid_until' }>; ctx: Ctx }) {
  const t = useTranslations('app.account.plan')
  const names = useNames()
  const date = summary.paidUntil
  const last = ctx.facts.last && ctx.facts.last.product.tier === summary.tier ? ctx.facts.last : null
  const wallet = last ? walletOf(last.method) : null
  const why =
    last && wallet
      ? t.rich('walletAlipayWhy', { ...richTags, interval: last.product.interval, method: t(METHOD_KEYS[wallet]), date })
      : t('walletWhy', { date })
  const offer = ctx.products.find(p => p.id === last?.product.id && p.priceUsd > 0)
  const options = summary.tier ? { tier: summary.tier, period: last?.product.interval, planId: offer?.id } : undefined
  const renew = offer ? t.rich('renewPrice', { ...richTags, price: names.usd(offer.priceUsd) }) : t('renew')
  return (
    <Pass state="wallet" tier={summary.tier} brand={ctx.facts.brand} head={<><span>{t('member')}</span><Status>{t('endsPlain', { date })}</Status></>} foot={<SinceFoot facts={ctx.facts}><BuyOnly ctx={ctx}><PaywallPill main options={options}>{renew}</PaywallPill></BuyOnly><StillBillsAct other={summary.stillBills} ctx={ctx} /></SinceFoot>}>
      <PassName>{names.tier(summary.tier)}</PassName>
      <Why>{why}</Why>
      <StillBillsLine other={summary.stillBills} />
    </Pass>
  )
}

// Buy buttons, left out for org staff (ctx.buy false).
function BuyOnly({ ctx, children }: { ctx: Ctx; children: ReactNode }) {
  return ctx.buy ? <>{children}</> : null
}

function NoPlanPass({ summary, ctx }: { summary: Extract<SubscriptionSummary, { kind: 'expired' | 'free' }>; ctx: Ctx }) {
  const t = useTranslations('app.account.plan')
  const names = useNames()
  const expired = summary.kind === 'expired'
  const lead = ctx.facts.last ? t('endedTier', { tier: names.tier(ctx.facts.last.product.tier) }) : t('endedPlain')
  const status = expired ? <Flag>{t('ended', { date: summary.paidUntil })}</Flag> : null
  const acts = (
    <BuyOnly ctx={ctx}>
      <PaywallPill main>{t('choosePlan')}</PaywallPill>
      {expired ? <PaywallPill options={{ step: 'packs' }}>{t('buyCredits')}</PaywallPill> : null}
    </BuyOnly>
  )
  return (
    <Pass state={expired ? 'expired' : 'free'} tier={null} brand={ctx.facts.brand} head={<><span>{t('member')}</span>{status}</>} foot={<SinceFoot facts={ctx.facts}>{acts}</SinceFoot>}>
      <PassName>{t('noPlan')}</PassName>
      <Why>{expired ? <>{lead} {t.rich('expiredRest', { ...richTags, paid: ctx.paid })}</> : t('freeWhy')}</Why>
    </Pass>
  )
}

export function PlanCard({ summary, products, paid, manage, cancelWaffo, facts, buy = true }: Props) {
  const ctx: Ctx = { manage, cancelWaffo, facts, products, paid, buy }
  if (summary.kind === 'subscription') return summary.provider === 'waffo' ? <WaffoPass summary={summary} ctx={ctx} /> : <SubscribedPass summary={summary} ctx={ctx} />
  if (summary.kind === 'paid_until') return <WalletPass summary={summary} ctx={ctx} />
  return <NoPlanPass summary={summary} ctx={ctx} />
}
