import { useFormatter, useTranslations } from 'next-intl'

import type { StaffCard, StaffLevel } from '../console/types'
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

// A member's customers page (Owner 2026-11-28), opened from 「我的客户」 on /account, only in an org
// that runs the affiliate program: their level-1 / level-2 customers with this month's spend (card
// E5, from the staff variant of org_member_stats: only their own row, never a commission). Their
// credits are on /account. Nothing here reads or changes anyone else's numbers.
export function MemberOrgView({ data }: { data: StaffCard }) {
  return <CustomerPanels data={data} />
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
