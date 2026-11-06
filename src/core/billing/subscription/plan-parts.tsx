import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

import type { MembershipTier } from '../../config'
import { cn } from '../../ui/cn'
import { PaywallButton } from '../paywall'
import type { PaywallOpenOptions } from '../paywall/use-paywall-state'

// Building blocks of the account Plan card (comps-v3-b/account.html, ?sub=…): the tier name in
// its paywall ink, one status on the right, a sentence saying what happens next, and the one
// thing to do. Display only; the states are picked in plan-card.tsx.

// The paywall's tier inks, quietly: only the name carries the material.
const TIER_INK: Record<MembershipTier, string> = {
  starter: 'text-foreground',
  pro: 'text-[var(--tier-sapphire-ink)]',
  max: 'text-[var(--tier-max-gold)]',
}

export function PlanShell({ state, children }: { state: string; children: ReactNode }) {
  return (
    <div data-plan={state} className="hairline-lit grid gap-3 rounded-panel bg-card p-4 md:px-6 md:py-5">
      {children}
    </div>
  )
}

export function PlanHead({ name, tier, aside }: { name: string; tier: MembershipTier | null; aside: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 md:items-center">
      <span className={cn('font-display text-h1 leading-none tracking-[-0.02em]', tier ? TIER_INK[tier] : 'text-foreground')}>{name}</span>
      {aside}
    </div>
  )
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-caption text-muted-foreground">{children}</p>
}

// "Payment failed" / "Ended 6 Nov 2026": a small plate with a dot, red when money went wrong.
export function Flag({ bad = false, children }: { bad?: boolean; children: ReactNode }) {
  return (
    <span
      data-flag={bad ? 'bad' : 'info'}
      className={cn(
        'inline-flex h-[26px] items-center gap-1.5 rounded-tag px-2.5 text-caption leading-none font-medium before:size-1.5 before:rounded-full before:bg-current',
        bad ? 'bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] text-destructive' : 'bg-wash-strong text-bone-dim',
      )}
    >
      {children}
    </span>
  )
}

export function Why({ children }: { children: ReactNode }) {
  return <p className="max-w-[52ch] text-label leading-normal text-pretty text-bone-dim">{children}</p>
}

export function Acts({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

// Bold and mono chunks of the plan sentences (app.account.plan rich messages).
export const richTags = {
  b: (chunks: ReactNode) => <b className="font-medium text-foreground">{chunks}</b>,
  mono: (chunks: ReactNode) => <span className="font-mono tracking-normal">{chunks}</span>,
}

const pill = 'press inline-flex items-center justify-center gap-1.5 rounded-full font-semibold tracking-[-0.01em] whitespace-nowrap'
// The ghost pill keeps a 44px hit area around its 36px face.
const ghost = cn(pill, 'relative h-9 bg-wash px-4 text-caption shadow-[inset_0_0_0_1px_var(--border)] before:absolute before:-inset-x-0.5 before:-inset-y-1')
const primary = cn(pill, 'min-h-11 bg-primary px-5 text-label text-primary-foreground')

// Every Stripe-side action (cancel, resume, change card, invoices) is one Customer Portal
// session, created by the server action app/ passes in (ARCHITECTURE §6.2).
export function PortalButton({ manage, main = false, external = false, children }: { manage: () => Promise<void>; main?: boolean; external?: boolean; children: ReactNode }) {
  return (
    <form action={manage}>
      <button type="submit" className={main ? primary : ghost}>
        {children}
        {external ? <ArrowUpRight aria-hidden className="size-4" strokeWidth={1.75} /> : null}
      </button>
    </form>
  )
}

export function PaywallPill({ main = false, options, children }: { main?: boolean; options?: PaywallOpenOptions; children: ReactNode }) {
  return (
    <PaywallButton trigger="account" options={options} className={main ? primary : ghost}>
      {children}
    </PaywallButton>
  )
}
