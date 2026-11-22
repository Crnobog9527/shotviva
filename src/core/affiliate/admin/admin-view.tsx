import type { ReactNode } from 'react'
import { AdminPage } from '@/core/admin'
import { COPY } from './copy'
import { FeesView } from './payment-fees-view'
import { PromoView } from './promo-view'
import { pendingPromoCount } from './promo-read'
import { CommissionsView, PayoutsView } from './financial-view'
import { MembersView, type ViewProps } from './members-view'
import { OverviewView, ErrorsView, AttributionView, SettingsView } from './overview-view'
import { LinkTo } from './parts'
import { tabs } from './query'

type Props = ViewProps & { actor: string }
const VIEWS: Record<Props['filters']['tab'], (props: Props) => ReactNode> = {
  overview: (p) => <OverviewView {...p} />,
  applications: (p) => <MembersView {...p} />,
  affiliates: (p) => <MembersView {...p} />,
  commissions: (p) => <CommissionsView {...p} />,
  payouts: (p) => <PayoutsView {...p} />,
  attribution: (p) => <AttributionView {...p} />,
  settings: (p) => <SettingsView {...p} />,
  fees: (p) => <FeesView {...p} />,
  promo: (p) => <PromoView {...p} />,
  errors: (p) => <ErrorsView {...p} />,
}
// The promo tab carries the number of grant sheets waiting for a confirm (0 hides it).
function TabLabel({ tab, pending }: { tab: (typeof tabs)[number]; pending: number }) {
  if (tab !== 'promo' || pending === 0) return COPY[tab]
  return (
    <>
      {COPY[tab]} <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{pending}</span>
    </>
  )
}
export async function AffiliateAdminView(props: Props) {
  const pending = await pendingPromoCount(props.db)
  return (
    <AdminPage title={COPY.title}>
      <nav aria-label={COPY.title} className="flex flex-wrap gap-x-5 gap-y-3 border-b pb-3 text-sm">
        {tabs.map((tab) =>
          tab === props.filters.tab ? (
            <strong key={tab} aria-current="page">
              <TabLabel tab={tab} pending={pending} />
            </strong>
          ) : (
            <LinkTo key={tab} filters={{ tab }}>
              <TabLabel tab={tab} pending={pending} />
            </LinkTo>
          ),
        )}
      </nav>
      {VIEWS[props.filters.tab](props)}
    </AdminPage>
  )
}
