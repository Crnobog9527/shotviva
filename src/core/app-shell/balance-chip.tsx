import Link from 'next/link'

import type { Balance } from '../billing/pools'
import { balanceChipLabel } from './balance-copy'
import { PAYWALL_HREF } from './paywall-entry'

// "Balance chip": a pill with a safelight coin and the balance beside it, linking to the
// paywall. The coin carries no number (TOKENS.md clean-up: no text under 14px).
export function BalanceChip({ balance }: { balance: Balance }) {
  const label = balanceChipLabel(balance)
  return (
    <Link
      href={PAYWALL_HREF}
      aria-label={`Balance: ${label}. Get credits`}
      className="press hairline relative inline-flex h-9 items-center gap-2 rounded-full bg-wash pr-3 pl-2 text-caption leading-none font-medium before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"
    >
      <span aria-hidden="true" className="size-4 rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--coin-light),var(--primary)_60%,var(--coin-dark))]" />
      {label}
    </Link>
  )
}
