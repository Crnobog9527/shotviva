import { useTranslations } from 'next-intl'

import type { Balance } from '../../billing'
import { PaywallButton } from '../../billing/paywall'
import { Chevron } from './rows'

// Credits as two cells, paid and free apart (DESIGN §4.3 "The Credits Unit Rule"), each with
// what it makes: paid photos are private with no watermark, free ones public and watermarked
// (ARCHITECTURE §6.1). "Buy credits" opens the paywall on the credit packs.

function Cell({ count, unit, use }: { count: number; unit: string; use: string }) {
  return (
    <div className="hairline-lit rounded-control bg-card px-4 py-3">
      <p className="font-display text-h1 leading-none tracking-[-0.02em]">
        {count}
        <small className="ml-1.5 font-mono text-caption tracking-normal text-muted-foreground">{unit}</small>
      </p>
      <p className="mt-1.5 text-caption text-muted-foreground">{use}</p>
    </div>
  )
}

export function CreditsCells({ balance, giftRefused }: { balance: Balance; giftRefused: boolean }) {
  const t = useTranslations('app.account.credits')
  const balanceT = useTranslations('app.balance')
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Cell count={balance.paid} unit={t('paid')} use={t('paidUse')} />
        <Cell count={balance.free} unit={t('free')} use={t('freeUse')} />
      </div>
      {giftRefused ? <p className="mt-2 text-caption text-muted-foreground">{balanceT('signupGiftRefused')}</p> : null}
      <PaywallButton trigger="account" options={{ step: 'packs' }} className="press mt-2 inline-flex min-h-11 items-center gap-1 text-caption font-medium text-foreground">
        {t('buy')}
        <Chevron className="size-4" />
      </PaywallButton>
    </>
  )
}
