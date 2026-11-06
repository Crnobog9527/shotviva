import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import type { Balance } from '../../billing'
import { PaywallButton } from '../../billing/paywall'
import type { Allowance } from '../../billing/subscription'
import { cn } from '../../ui/cn'
import { Chevron } from './rows'

// Credits as two dials, paid and free apart (DESIGN §4.3 "The Credits Unit Rule"; comps-v3-b
// account.html). Each ring shows what is left of what the period (or the signup gift) gave,
// and says what those credits make: paid photos are private with no watermark, free ones public
// and watermarked (ARCHITECTURE §6.1). "Buy credits" opens the paywall on the credit packs.

type DialProps = { kind: 'paid' | 'free'; count: number; of: number | null; label: string; ringLabel: string }

// Share of the ring: left over given, full when there is no "given" (or more than it).
export function ringValue(count: number, of: number | null): number {
  if (of === null || of <= 0) return count > 0 ? 100 : 0
  return Math.round(Math.min(1, count / of) * 100)
}

function Dial({ kind, count, of, label, ringLabel }: DialProps) {
  const t = useTranslations('app.account.credits')
  return (
    <div data-dial={kind} className="hairline-lit flex items-center gap-2.5 rounded-tile bg-card p-3 md:gap-3 md:px-4 md:py-3.5">
      <span
        role="img"
        aria-label={ringLabel}
        className={cn('credit-ring size-13 shrink-0 rounded-full md:size-16', kind === 'free' && '[--ring-c:var(--bone-dim)]')}
        style={{ '--ring-v': ringValue(count, of) } as CSSProperties}
      />
      <div className="min-w-0">
        <p className="font-display text-h1 leading-none tracking-[-0.02em] whitespace-nowrap">
          {count}
          <small className="ml-1.5 font-mono text-caption tracking-normal text-muted-foreground">{t(kind)}</small>
        </p>
        <p className="mt-1 text-caption leading-[1.3] text-muted-foreground hyphens-auto">{label}</p>
      </div>
    </div>
  )
}

type Props = { balance: Balance; giftRefused: boolean; allowance: Allowance | null; freeGift: number }

// The two dials' words: "of 50 this month" only while it is true, since packs or a carried-over
// balance can top what the period gave.
function useDialCopy(balance: Balance, allowance: Allowance | null, freeGift: number) {
  const t = useTranslations('app.account.credits')
  const paidOf = allowance && balance.paid <= allowance.credits ? allowance : null
  const freeOf = balance.free <= freeGift ? freeGift : null
  const paid = paidOf
    ? { of: paidOf.credits, label: t('paidOf', { total: paidOf.credits, interval: paidOf.interval }), ringLabel: t('paidRingOf', { count: balance.paid, total: paidOf.credits }) }
    : { of: null, label: t('paidUse'), ringLabel: t('paidRing', { count: balance.paid }) }
  const free = freeOf
    ? { of: freeOf, label: t('freeOf', { total: freeOf }), ringLabel: t('freeRingOf', { count: balance.free, total: freeOf }) }
    : { of: null, label: t('freeUse'), ringLabel: t('freeRing', { count: balance.free }) }
  return { paid, free }
}

export function CreditDials({ balance, giftRefused, allowance, freeGift }: Props) {
  const t = useTranslations('app.account.credits')
  const balanceT = useTranslations('app.balance')
  const copy = useDialCopy(balance, allowance, freeGift)
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Dial kind="paid" count={balance.paid} {...copy.paid} />
        <Dial kind="free" count={balance.free} {...copy.free} />
      </div>
      {giftRefused ? <p className="mt-2 text-caption text-muted-foreground">{balanceT('signupGiftRefused')}</p> : null}
      <PaywallButton trigger="account" options={{ step: 'packs' }} className="press mt-2 inline-flex min-h-11 items-center gap-1 text-caption font-medium text-foreground">
        {t('buy')}
        <Chevron className="size-4" />
      </PaywallButton>
    </>
  )
}
