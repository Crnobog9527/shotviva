import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { EnterpriseContact } from '@/core/config'
import { Link } from '@/core/i18n/ui'

import type { OwnerConsole, OwnerReport } from '../console/types'
import type { OwnerActions } from './actions'
import { enterpriseHome } from './enterprise-frame'
import { MembersPanel } from './members-panel'
import { PerformancePanel } from './performance-panel'
import { PoolMonthPanel } from './pool-month-panel'
import { PackagesPanel, PaymentAccountsPanel, PoolPanel } from './owner-panels'
import { monthShowsPromo } from './promo-visibility'
import { StaffLinkPanel } from './staff-link-panel'

// /account/enterprise, 「企业工作台」 (ARCHITECTURE §6.5, card E4): the staff-only link first (Owner
// 2026-11-22), then pool, members and this month's output. The server page reads `data` and
// passes the server actions; everything below is the owner's own org, read from their session.
export function OwnerConsoleView({ data, actions, report, affiliate }: { data: OwnerConsole; actions: OwnerActions; report: OwnerReport | null; affiliate: boolean }) {
  return (
    <>
      <SuspendedBanner data={data} />
      <StaffLinkPanel data={data} actions={actions} affiliate={affiliate} />
      <PoolPanel data={data} actions={actions} />
      <PoolMonthPanel month={data.poolMonth} promo={monthShowsPromo(data.org, data.poolMonth)} />
      <MembersPanel data={data} actions={actions} />
      <PerformancePanel report={report} />
    </>
  )
}

// /account/enterprise/purchasing, 「企业集采信息」: package prices and how to pay for them.
export function PurchasingView({ data, contact }: { data: OwnerConsole; contact?: EnterpriseContact }) {
  return (
    <>
      <SuspendedBanner data={data} />
      <PackagesPanel packages={data.packages} contact={contact} />
      <PaymentAccountsPanel groups={data.paymentAccounts} orgName={data.org.name} refCode={data.org.refCode} />
    </>
  )
}

function SuspendedBanner({ data }: { data: OwnerConsole }) {
  const t = useTranslations('app.org')
  if (data.org.status !== 'suspended') return null
  return <p role="status" className="hairline rounded-panel bg-card p-4 text-label text-destructive">{t('suspendedBanner')}</p>
}

// The row on /account that opens the enterprise area, at its first section: the affiliate
// dashboard when the org has one, else the workspace.
export function OwnerEntryRow({ name, pool, suspended, affiliate }: { name: string; pool: string; suspended: boolean; affiliate: boolean }) {
  const t = useTranslations('app.org.entry')
  return (
    <Link href={enterpriseHome(affiliate)} className="flex min-h-14 w-full items-center justify-between gap-3 text-left text-body text-foreground">
      <span className="min-w-0">
        <span className="block truncate font-medium">{name}</span>
        <span className="block text-caption text-muted-foreground">{suspended ? t('suspended') : t('pool', { pool })}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-label text-muted-foreground">{t('open')}<ChevronRight aria-hidden strokeWidth={1.75} className="size-[18px] text-primary" /></span>
    </Link>
  )
}
