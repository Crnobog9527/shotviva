import { useTranslations } from 'next-intl'

import { buttonVariants } from '../../ui/button'
import { PaywallButton } from '../paywall'
import type { SubscriptionSummary } from './summary'

// Account page "Subscription" block (DESIGN §4.5): plan and period ("Pro · Yearly"), status
// (Active / Cancels on … / Past due / Free), the next renewal date and "Manage subscription",
// which opens the Stripe Customer Portal through the server action passed in by app/. Wallet
// buyers see "Paid until …" and Renew. Display only: the summary comes from the mirror.

type Props = { summary: SubscriptionSummary; manage: () => Promise<void> }

const button = buttonVariants({ variant: 'glass', size: 'touch', className: 'mt-3 w-full' })

function Status({ label, detail }: { label: string; detail?: string }) {
  return (
    <>
      <p className="mt-2 text-body font-medium">{label}</p>
      {detail ? <p className="mt-1 text-caption text-bone-dim">{detail}</p> : null}
    </>
  )
}

function SubscribedView({ summary, manage }: { summary: SubscriptionSummary & { kind: 'subscription' }; manage: Props['manage'] }) {
  const t = useTranslations('app.subscription')
  const tiers = useTranslations('paywall.tiers')
  const date = summary.periodEnd
  const status = {
    active: <Status label={t('active')} detail={t('renewsOn', { date })} />,
    cancels: <Status label={t('cancelsOn', { date })} detail={t('cancelsDetail')} />,
    past_due: <Status label={t('pastDue')} detail={summary.expired ? t('pastDueExpired') : t('pastDueDetail')} />,
    paused: <Status label={t('paused')} />,
  }[summary.state]
  return (
    <>
      <p className="mt-2 text-caption text-muted-foreground">
        {t('plan', { tier: tiers(summary.tier), interval: summary.interval })}
      </p>
      {status}
      <form action={manage}>
        <button type="submit" className={button}>
          {t('manage')}
        </button>
      </form>
    </>
  )
}

function UnsubscribedView({ summary }: { summary: Exclude<SubscriptionSummary, { kind: 'subscription' }> }) {
  const t = useTranslations('app.subscription')
  const tiers = useTranslations('paywall.tiers')
  if (summary.kind === 'paid_until') {
    return (
      <>
        {summary.tier ? <p className="mt-2 text-caption text-muted-foreground">{tiers(summary.tier)}</p> : null}
        <Status label={t('paidUntil', { date: summary.paidUntil })} detail={t('noAutoRenew')} />
        <PaywallButton trigger="account" options={summary.tier ? { step: 'period', tier: summary.tier } : undefined} className={button}>
          {t('renew')}
        </PaywallButton>
      </>
    )
  }
  return (
    <>
      {summary.kind === 'expired' ? (
        <Status label={t('expired')} detail={t('expiredDetail', { date: summary.paidUntil })} />
      ) : (
        <Status label={t('free')} detail={t('freeDetail')} />
      )}
      <PaywallButton trigger="account" className={button}>
        {t('seePlans')}
      </PaywallButton>
    </>
  )
}

export function SubscriptionPanel({ summary, manage }: Props) {
  const t = useTranslations('app.subscription')
  return (
    <div>
      <h2 className="text-headline leading-[1.25] font-semibold">{t('title')}</h2>
      {summary.kind === 'subscription' ? <SubscribedView summary={summary} manage={manage} /> : <UnsubscribedView summary={summary} />}
    </div>
  )
}
