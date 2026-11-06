import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

import type { MembershipTier } from '../../config'
import { cn } from '../../ui/cn'
import { PaywallButton } from '../paywall'
import type { PaywallOpenOptions } from '../paywall/use-paywall-state'

// Building blocks of the account membership pass (comps-v3-b/account.html, ?sub=…): a card in
// the tier's paywall material with the word mark debossed, "Member" and the status along the
// top, the tier name large in the middle with one sentence on what happens next, and "Since"
// plus the one thing to do along the bottom. Display only; the states are picked in
// plan-card.tsx. Materials live in globals.css (.member-pass).

type PassProps = { state: string; tier: MembershipTier | null; brand: string; head: ReactNode; foot: ReactNode; children: ReactNode }

export function Pass({ state, tier, brand, head, foot, children }: PassProps) {
  return (
    <div
      data-plan={state}
      data-tier={tier ?? 'none'}
      className="member-pass grid min-h-[196px] grid-rows-[auto_1fr_auto] gap-3.5 px-[18px] pt-[18px] pb-4 md:min-h-[220px] md:px-6 md:pt-[22px] md:pb-5"
    >
      <span aria-hidden="true" className="pass-mark">
        {brand}.
      </span>
      <div className="pass-caps flex items-center justify-between gap-3 font-mono text-caption leading-none tracking-[0.06em] text-muted-foreground uppercase">{head}</div>
      <div className="self-center">{children}</div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5">{foot}</div>
    </div>
  )
}

// The status on the right of the top line ("RENEWS 6 DEC 2026"), in the line's mono capitals;
// a Flag there keeps its own plain case.
export function Status({ children }: { children: ReactNode }) {
  return <span className="text-right">{children}</span>
}

export function PassName({ children }: { children: ReactNode }) {
  return <p className="pass-name font-display text-[44px] leading-none tracking-[-0.03em] md:text-[52px]">{children}</p>
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-caption text-muted-foreground">{children}</p>
}

// "Since / Nov 2026": a small capital label over a plain value, bottom left of the pass.
export function Since({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="pass-caps font-mono text-caption leading-[1.4] tracking-[0.06em] text-muted-foreground uppercase">
      {label}
      <b className="block font-sans text-label leading-[1.3] font-normal tracking-normal text-bone-dim normal-case">{children}</b>
    </span>
  )
}

// "Payment failed" / "Ended 6 Nov 2026": a small plate with a dot, red when money went wrong.
export function Flag({ bad = false, children }: { bad?: boolean; children: ReactNode }) {
  return (
    <span
      data-flag={bad ? 'bad' : 'info'}
      className={cn(
        'inline-flex h-[26px] items-center gap-1.5 rounded-tag px-2.5 font-sans text-caption leading-none font-medium tracking-normal normal-case before:size-1.5 before:rounded-full before:bg-current',
        bad ? 'bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] text-destructive' : 'bg-wash-strong text-bone-dim',
      )}
    >
      {children}
    </span>
  )
}

export function Why({ children }: { children: ReactNode }) {
  return <p className="mt-2 max-w-[52ch] text-label leading-normal text-pretty text-bone-dim">{children}</p>
}

export function Acts({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

// Bold, mono and price chunks of the plan sentences (app.account.plan rich messages).
export const richTags = {
  b: (chunks: ReactNode) => <b className="font-medium text-foreground">{chunks}</b>,
  mono: (chunks: ReactNode) => <span className="font-mono tracking-normal">{chunks}</span>,
  cost: (chunks: ReactNode) => <span className="font-normal opacity-80">{chunks}</span>,
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
