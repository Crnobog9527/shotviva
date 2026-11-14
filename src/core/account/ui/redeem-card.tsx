import { useTranslations } from 'next-intl'

import type { PendingDiscount } from '../../codes'
import { DiscountSummary, RedeemForm } from '../../codes/ui'
import { Group } from './rows'

export function RedeemCard({ pending }: { pending: PendingDiscount | null }) {
  const t = useTranslations('app.accountCodes.redeem')
  return (
    <Group title={t('title')}>
      <div className="hairline-lit space-y-3 rounded-panel bg-card p-4">
        <RedeemForm context="account" pendingCode={pending?.code ?? null} />
        {pending && <div className="border-t border-hairline pt-3"><DiscountSummary value={pending} /></div>}
      </div>
    </Group>
  )
}
