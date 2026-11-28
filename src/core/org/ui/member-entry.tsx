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

// A member's own customers page: only an org that runs the affiliate program has one.
export const MEMBER_ORG_HREF = '/account/enterprise'
export const ORG_WORKS_HREF = '/account/enterprise/works'

// 「企业」 on /account for a member (Owner 2026-11-28): everything a member needs is here, with no
// back office to open. This month's credits from the org, a direct way into 企业作品, and, in an
// org that runs the affiliate program, their customers. A member cannot leave by themselves (only
// the org owner or a site admin removes them).
export function MemberEntry({ data }: { data: StaffCard }) {
  const t = useTranslations('app.org.staff')
  const format = useFormatter()
  return (
    <RowsPanel>
      <div className="py-3">
        <p className="truncate font-medium">{data.orgName}</p>
        <p className="text-caption text-muted-foreground">{t(data.status === 'suspended' ? 'suspended' : 'entryNote')}</p>
      </div>
      <CreditStats title={t('paidCredits')} figures={{ allowance: data.monthlyAllowance, allocated: data.allocatedThisMonth, held: data.heldCredits }} />
      {showsPromo(data) ? <CreditStats title={t('promoCredits')} figures={data.promo} note={t('promoCreditsHint')} /> : null}
      <Link href={ORG_WORKS_HREF} className={rowClass}>
        <span className="font-medium">{t('works')}</span>
        <RowValue>{t('worksNote')}</RowValue>
      </Link>
      {data.withAffiliate ? (
        <Link href={MEMBER_ORG_HREF} className={rowClass}>
          <span className="font-medium">{t('level1')}</span>
          <RowValue>{format.number(data.customers)}</RowValue>
        </Link>
      ) : null}
    </RowsPanel>
  )
}

type Figures = { allowance: number; allocated: number; held: number }

// One kind of org credits for this UTC month: the allowance, what came in, what is left. A dash,
// never a zero, when the figures could not be read.
function CreditStats({ title, figures, note }: { title: string; figures: Figures | null; note?: string }) {
  const t = useTranslations('app.org.staff')
  const format = useFormatter()
  const show = (pick: (f: Figures) => number) => (figures ? format.number(pick(figures)) : '—')
  return (
    <div className="py-3">
      <p className="text-label font-medium">{title}</p>
      <div className="mt-2 grid grid-cols-3 gap-3">
        <Stat label={t('allowance')} value={show((f) => f.allowance)} />
        <Stat label={t('allocated')} value={show((f) => f.allocated)} />
        <Stat label={t('left')} value={show((f) => f.held)} />
      </div>
      {note ? <p className="mt-2 text-caption text-muted-foreground">{note}</p> : null}
    </div>
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
