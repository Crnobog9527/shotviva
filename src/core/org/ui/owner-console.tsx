import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Link } from '@/core/i18n/ui'

import type { OwnerConsole, OwnerReport } from '../console/types'
import type { OwnerActions } from './actions'
import { MembersPanel } from './members-panel'
import { PerformancePanel } from './performance-panel'
import { InvitePanel, PackagesPanel, PaymentAccountsPanel, PoolPanel } from './owner-panels'

// /account/enterprise, 「企业」 tab (ARCHITECTURE §6.5, card E4): pool, packages, invite link,
// members. The server page reads `data` and passes the server actions; everything below is the
// owner's own org, read from their session.

export function OwnerConsoleView({ data, actions, report }: { data: OwnerConsole; actions: OwnerActions; report: OwnerReport | null }) {
  const t = useTranslations('app.org')
  return (
    <div className="space-y-4">
      {data.org.status === 'suspended' ? (
        <p role="status" className="hairline rounded-panel bg-card p-4 text-label text-destructive">{t('suspendedBanner')}</p>
      ) : null}
      <PoolPanel data={data} actions={actions} />
      <PackagesPanel packages={data.packages} />
      <PaymentAccountsPanel groups={data.paymentAccounts} orgName={data.org.name} />
      <InvitePanel data={data} actions={actions} />
      <MembersPanel data={data} actions={actions} />
      <PerformancePanel report={report} />
    </div>
  )
}

// The two tabs of the owner's enterprise area. 「企业联盟」 is the partner dashboard of the org's
// affiliate account (reusing the /partners components), shown only when the org's affiliate
// switch is on.
export function OrgTabs({ current, affiliate }: { current: 'console' | 'affiliate'; affiliate: boolean }) {
  const t = useTranslations('app.org.tabs')
  const base = 'inline-flex min-h-11 items-center rounded-button px-4 text-label font-semibold'
  return (
    <nav aria-label={t('label')} className="flex gap-1 border-b border-hairline">
      <Link href="/account/enterprise" aria-current={current === 'console' ? 'page' : undefined} className={`${base} ${current === 'console' ? 'bg-wash' : 'text-muted-foreground'}`}>{t('console')}</Link>
      {affiliate ? (
        <Link href="/partners/enterprise" aria-current={current === 'affiliate' ? 'page' : undefined} className={`${base} ${current === 'affiliate' ? 'bg-wash' : 'text-muted-foreground'}`}>{t('affiliate')}</Link>
      ) : null}
    </nav>
  )
}

// The row on /account that opens the console: the pool at a glance.
export function OwnerEntryRow({ name, pool, suspended }: { name: string; pool: string; suspended: boolean }) {
  const t = useTranslations('app.org.entry')
  return (
    <Link href="/account/enterprise" className="flex min-h-14 w-full items-center justify-between gap-3 text-left text-body text-foreground">
      <span className="min-w-0">
        <span className="block truncate font-medium">{name}</span>
        <span className="block text-caption text-muted-foreground">{suspended ? t('suspended') : t('pool', { pool })}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-label text-muted-foreground">{t('open')}<ChevronRight aria-hidden strokeWidth={1.75} className="size-[18px] text-primary" /></span>
    </Link>
  )
}
