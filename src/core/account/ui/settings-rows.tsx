import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import { HelpRow } from './help-row'
import { RowValue, RowsPanel, rowClass } from './rows'
import type { PurchaseLine } from '../../billing/documents/lines'
import { PurchasesRow } from './purchases-row'
import { LanguageRow } from './sheet-rows'

// Settings (comps-v3-b/account.html): Email (shown, not editable in v1; a phone sign-up shows
// its masked number instead, and has no email row when it has no email, T63), Language (the
// NEXT_LOCALE preference), Purchases (the account's recent payments) and Support (the in-site
// tickets in a dialog, with the "new reply" dot). Admins get "Admin" on top (ARCHITECTURE §10, spec #186):
// decided here on the server, so a normal user's HTML and client props never carry it. It is
// only a way in; /admin checks the role itself.

type Props = { email: string | null; phone: string | null; purchases: readonly PurchaseLine[]; morePurchases: boolean; helpUnread: boolean; admin: boolean; affiliate?: boolean }

export function SettingsRows({ email, phone, purchases, morePurchases, helpUnread, admin, affiliate }: Props) {
  const t = useTranslations('app.account.settings')
  const affiliateT = useTranslations('affiliate')
  const adminT = useTranslations('adminEntry')
  const favoritesT = useTranslations('app.favorites')
  return (
    <RowsPanel>
      {admin ? (
        <Link href="/admin" data-admin-entry="" className={rowClass}>
          {adminT('label')}
          <RowValue />
        </Link>
      ) : null}
      {affiliate && (
        <Link href="/partners" className={rowClass}>
          {affiliateT('dashboardLink')}
          <RowValue />
        </Link>
      )}
      {/* 我的收藏 (Owner 2026-11-13): Create opened on its Saved filter. */}
      <Link href="/generate?saved=1" className={rowClass}>
        {favoritesT('mine')}
        <RowValue />
      </Link>
      {phone ? <FactRow label={t('phone')} value={phone} /> : null}
      {email || !phone ? <FactRow label={t('email')} value={email} /> : null}
      <LanguageRow />
      <PurchasesRow purchases={purchases} more={morePurchases} />
      <HelpRow unread={helpUnread} />
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
