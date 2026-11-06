import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import { UnreadDot } from '../../support/ui'
import { RowValue, RowsPanel, rowClass } from './rows'
import { LanguageRow, PurchasesRow, type PurchaseLine } from './sheet-rows'

// Settings (comps-v3-b/account.html): Email (shown, not editable in v1), Language (the
// NEXT_LOCALE preference), Purchases (the account's recent payments) and Support (the in-site
// tickets, with the "new reply" dot).

type Props = { email: string | null; purchases: readonly PurchaseLine[]; morePurchases: boolean; helpUnread: boolean }

export function SettingsRows({ email, purchases, morePurchases, helpUnread }: Props) {
  const t = useTranslations('app.account.settings')
  const support = useTranslations('app.support')
  return (
    <RowsPanel>
      <div className={rowClass}>
        {t('email')}
        <RowValue chevron={false}>
          <span className="truncate" title={email ?? undefined}>
            {email}
          </span>
        </RowValue>
      </div>
      <LanguageRow />
      <PurchasesRow purchases={purchases} more={morePurchases} />
      <Link href="/account/help" className={rowClass}>
        <span className="inline-flex items-center gap-2">
          {t('support')}
          {helpUnread ? <UnreadDot label={support('newReply')} /> : null}
        </span>
        <RowValue>{t('openTicket')}</RowValue>
      </Link>
    </RowsPanel>
  )
}
