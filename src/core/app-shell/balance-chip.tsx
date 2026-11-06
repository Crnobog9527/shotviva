import { useTranslations } from 'next-intl'

import { PaywallButton } from '../billing/paywall'
import type { Balance } from '../billing/pools'
import { balanceChipLabel } from './balance-copy'

// "Balance chip": a pill with a safelight coin and the balance beside it, opening the
// paywall. The coin carries no number (TOKENS.md clean-up: no text under 14px).
export function BalanceChip({ balance }: { balance: Balance }) {
  const t = useTranslations('app.balance')
  const label = balanceChipLabel(balance, t)
  return (
    <PaywallButton
      trigger="account"
      aria-label={t('chipAria', { label })}
      className="press hairline relative inline-flex h-9 items-center gap-2 rounded-full bg-wash pr-3 pl-2 text-caption leading-none font-medium whitespace-nowrap before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"
    >
      <span aria-hidden="true" className="size-4 rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--coin-light),var(--primary)_60%,var(--coin-dark))]" />
      {label}
    </PaywallButton>
  )
}
