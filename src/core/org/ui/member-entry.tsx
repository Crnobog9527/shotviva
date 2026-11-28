import { useFormatter, useTranslations } from 'next-intl'
import { UsersRound } from 'lucide-react'

import { RowValue, RowsPanel, rowClass } from '@/core/account/ui/rows'
import { Link } from '@/core/i18n/ui'

import type { StaffCard } from '../console/types'
import { InviteLinkBox } from './invite-link-box'
import { LinkCallout } from './link-callout'
import { Stat } from './parts'

// Promotion credits come only with the enterprise affiliate program (1842). An org that has just
// left it still shows what its member holds until the month-end expiry clears it.
export function showsPromo(data: StaffCard) {
  return data.withAffiliate || (data.promo?.held ?? 0) > 0
}

// Where a member's org row goes: their own view inside the org (customers, month in detail).
export const MEMBER_ORG_HREF = '/account/enterprise'

// 「企业」 on /account for a member (Owner 2026-11-23): only the essentials. The org name opens
// the member's own org page, then what is left of this month's paid and promotion credits against
// their allowances. Customers and the month in detail live on the org page, and a member cannot
// leave by themselves (only the org owner or a site admin removes them).
export function MemberEntry({ data }: { data: StaffCard }) {
  const t = useTranslations('app.org.staff')
  const format = useFormatter()
  return (
    <RowsPanel>
      <Link href={MEMBER_ORG_HREF} className={rowClass}>
        <span className="min-w-0">
          <span className="block truncate font-medium">{data.orgName}</span>
          <span className="block text-caption text-muted-foreground">{data.status === 'suspended' ? t('suspended') : t(data.withAffiliate ? 'entryHint' : 'entryHintNoAffiliate')}</span>
        </span>
        <RowValue>{t('open')}</RowValue>
      </Link>
      <div className="grid grid-cols-2 gap-3 py-3">
        <Stat label={t('paidLeft')} value={format.number(data.heldCredits)} note={t('monthly', { count: format.number(data.monthlyAllowance) })} />
        {showsPromo(data) ? (
          <Stat
            label={t('promoLeftLabel')}
            value={data.promo ? format.number(data.promo.held) : '—'}
            note={data.promo ? t('monthly', { count: format.number(data.promo.allowance) }) : undefined}
          />
        ) : null}
      </div>
    </RowsPanel>
  )
}

// The member's own promotion link (their invite code, T94) on the highlighted surface the owner's
// staff link wears. `path` is site-relative; InviteLinkBox adds the origin in the browser.
export function MemberLinkCallout({ path }: { path: string }) {
  const t = useTranslations('app.org.staff')
  return (
    <div className="mt-2">
      <LinkCallout icon={UsersRound} title={t('promoTitle')} hint={t('promoHint')}>
        <InviteLinkBox path={path} />
      </LinkCallout>
    </div>
  )
}
