import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import { UnreadDot } from '../../support/ui'
import { RowValue, RowsPanel, rowClass } from './rows'
import { LanguageRow, PurchasesRow, type PurchaseLine } from './sheet-rows'

// Settings (comps-v3-b/account.html): Email (shown, not editable in v1; a phone sign-up shows
// its masked number instead, and has no email row when it has no email, T63), Language (the
// NEXT_LOCALE preference), Purchases (the account's recent payments) and Support (the in-site
// tickets, with the "new reply" dot). Admins get "Admin" on top (ARCHITECTURE §10, spec #186):
// decided here on the server, so a normal user's HTML and client props never carry it. It is
// only a way in; /admin checks the role itself.

type Props = { email: string | null; phone: string | null; purchases: readonly PurchaseLine[]; morePurchases: boolean; helpUnread: boolean; admin: boolean }

export function SettingsRows({ email, phone, purchases, morePurchases, helpUnread, admin }: Props) {
  const t = useTranslations('app.account.settings')
  const support = useTranslations('app.support')
  const adminT = useTranslations('adminEntry')
  return (
    <RowsPanel>
      {admin ? (
        <Link href="/admin" data-admin-entry="" className={rowClass}>
          {adminT('label')}
          <RowValue />
        </Link>
      ) : null}
      {phone ? <FactRow label={t('phone')} value={phone} /> : null}
      {email || !phone ? <FactRow label={t('email')} value={email} /> : null}
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

function FactRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={rowClass}>
      {label}
      <RowValue chevron={false}>
        <span className="truncate tabular-nums" title={value ?? undefined}>
          {value}
        </span>
      </RowValue>
    </div>
  )
}
