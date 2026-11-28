import { useFormatter, useTranslations } from 'next-intl'

import type { StaffCard, StaffLevel } from '../console/types'
import { showsPromo } from './member-entry'
import { Panel, Stat } from './parts'

// One level of the member's own customers: how many in all, and this month's new, paying and spend.
function LevelStats({ level }: { level: StaffLevel | null }) {
  const t = useTranslations('app.org.staff')
  const format = useFormatter()
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('customers')} value={level ? format.number(level.customers) : '—'} note={level ? t('newThisMonth', { count: level.signups }) : undefined} />
        <Stat label={t('paying')} value={level ? format.number(level.paying) : '—'} />
        <Stat label={t('spend')} value={level ? format.number(level.paidCents / 100, { style: 'currency', currency: 'USD' }) : '—'} />
      </div>
      {level ? null : <p className="text-caption text-muted-foreground">{t('statsUnavailable')}</p>}
    </>
  )
}

// A member's own view inside their org (Owner 2026-11-23), opened from 「企业」 on /account:
// this month's paid and promotion credits in detail, and their level-1 / level-2 customers with
// this month's spend (card E5, from the staff variant of org_member_stats: only their own row,
// never a commission; customers only when the org runs the affiliate program). Nothing here reads or changes anyone else's numbers.
export function MemberOrgView({ data }: { data: StaffCard }) {
  const t = useTranslations('app.org.staff')
  const format = useFormatter()
  const { promo } = data
  return (
    <>
      <Panel title={t('paidCredits')} hint={data.status === 'suspended' ? t('suspended') : undefined}>
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t('allowance')} value={format.number(data.monthlyAllowance)} />
          <Stat label={t('allocated')} value={format.number(data.allocatedThisMonth)} />
          <Stat label={t('remaining')} value={format.number(data.heldCredits)} />
        </div>
      </Panel>
      {showsPromo(data) ? <Panel title={t('promoCredits')} hint={t('promoCreditsHint')}>
        {promo ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('allowance')} value={format.number(promo.allowance)} />
            <Stat label={t('allocated')} value={format.number(promo.allocated)} />
            <Stat label={t('used')} value={format.number(promo.used)} />
            <Stat label={t('promoLeft')} value={format.number(promo.held)} />
          </div>
        ) : <p className="text-caption text-muted-foreground">{t('statsUnavailable')}</p>}
      </Panel> : null}
      {data.withAffiliate ? <CustomerPanels data={data} /> : null}
    </>
  )
}

// The member's level-1 customers, and level 2 when the org has it.
function CustomerPanels({ data }: { data: StaffCard }) {
  const t = useTranslations('app.org.staff')
  return (
    <>
      <Panel title={t('level1')} hint={t('level1Hint', { month: data.period })}>
        <LevelStats level={data.performance?.l1 ?? null} />
      </Panel>
      {data.withLevel2 ? (
        <Panel title={t('level2')} hint={t('level2Hint', { month: data.period })}>
          <LevelStats level={data.performance?.l2 ?? null} />
        </Panel>
      ) : null}
    </>
  )
}
