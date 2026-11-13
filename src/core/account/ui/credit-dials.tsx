import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import type { Balance } from '../../billing'
import { PaywallButton } from '../../billing/paywall'
import type { SignupGiftRefusal } from '../../auth/signup-gift'
import type { Allowance } from '../../billing/subscription'
import { cn } from '../../ui/cn'
import { Chevron } from './rows'

// Credits as two dials, paid and free apart (DESIGN §4.3 "The Credits Unit Rule"; comps-v3-b
// account.html). Each ring shows what is left of what the period (or the signup gift) gave,
// and says what those credits make: paid photos are private with no watermark, free ones public
// and watermarked (ARCHITECTURE §6.1). "Buy credits" opens the paywall on the credit packs.
//
// The two dials sit one above the other and "of N" rides next to the count ("3 / 6 free"), so
// each line under a count is one short phrase that stays on one line at every width (Owner
// 2026-11-08: "共 6 · 公开、带水印" left "印" alone on a second line). Side by side, the text beside a
// ring had 82px at 375, 26px at 768 and 109px at 1440.

type DialProps = { kind: 'paid' | 'free'; count: number; of: number | null; label: string; ringLabel: string }

export type DialFigures = { paidOf: number | null; freeOf: number | null }

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
          <small className="ml-1.5 font-mono text-caption tracking-normal text-muted-foreground">
            {of === null ? t(kind) : t('outOf', { total: of, kind: t(kind) })}
          </small>
        </p>
        <p className="mt-1 truncate text-caption leading-[1.3] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

type Props = { balance: Balance; giftRefused: SignupGiftRefusal | null; allowance: Allowance | null; freeGift: number }

// The account page's note, by refusal reason (1350).
const REFUSAL_COPY = { same_ip: 'signupGiftRefused', daily_cap: 'signupGiftRefusedCap', paused: 'signupGiftRefusedPaused' } as const

// What each ring is measured against: "of 50" only while it is true, since packs or a
// carried-over balance can top what the period gave; "of 6" only when the signup gift was
// actually given (the same-IP rule can withhold it, ARCHITECTURE §7: then "0 / 6" reads wrong).
export function dialFigures(balance: Balance, allowance: Allowance | null, freeGift: number, giftRefused: boolean): DialFigures {
  return {
    paidOf: allowance && balance.paid <= allowance.credits ? allowance.credits : null,
    freeOf: !giftRefused && freeGift > 0 && balance.free <= freeGift ? freeGift : null,
  }
}

function useDialCopy(balance: Balance, figures: DialFigures) {
  const t = useTranslations('app.account.credits')
  const { paidOf, freeOf } = figures
  const paid = { of: paidOf, label: t('paidUse'), ringLabel: paidOf === null ? t('paidRing', { count: balance.paid }) : t('paidRingOf', { count: balance.paid, total: paidOf }) }
  const free = { of: freeOf, label: t('freeUse'), ringLabel: freeOf === null ? t('freeRing', { count: balance.free }) : t('freeRingOf', { count: balance.free, total: freeOf }) }
  return { paid, free }
}

export function CreditDials({ balance, giftRefused, allowance, freeGift }: Props) {
  const t = useTranslations('app.account.credits')
  const balanceT = useTranslations('app.balance')
  const copy = useDialCopy(balance, dialFigures(balance, allowance, freeGift, giftRefused !== null))
  return (
    <>
      <div className="grid gap-2">
        <Dial kind="paid" count={balance.paid} {...copy.paid} />
        <Dial kind="free" count={balance.free} {...copy.free} />
      </div>
      {giftRefused ? <p className="mt-2 text-caption text-muted-foreground">{balanceT(REFUSAL_COPY[giftRefused])}</p> : null}
      <PaywallButton trigger="account" options={{ step: 'packs' }} className="press mt-2 inline-flex min-h-11 items-center gap-1 text-caption font-medium text-foreground">
        {t('buy')}
        <Chevron className="size-4" />
      </PaywallButton>
    </>
  )
}
