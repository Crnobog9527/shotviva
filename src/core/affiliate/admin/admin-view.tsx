import { AdminPage } from '@/core/admin'
import { COPY } from './copy'
import { CommissionsView, PayoutsView } from './financial-view'
import { MembersView, type ViewProps } from './members-view'
import { OverviewView, ErrorsView, AttributionView, SettingsView } from './overview-view'
import { LinkTo } from './parts'
import { tabs } from './query'

type Props = ViewProps & { actor: string }
function Content(props: Props) {
  switch (props.filters.tab) {
    case 'overview':
      return <OverviewView {...props} />
    case 'applications':
    case 'affiliates':
      return <MembersView {...props} />
    case 'commissions':
      return <CommissionsView {...props} />
    case 'payouts':
      return <PayoutsView {...props} />
    case 'attribution':
      return <AttributionView {...props} />
    case 'settings':
      return <SettingsView {...props} />
    case 'errors':
      return <ErrorsView {...props} />
  }
}
export function AffiliateAdminView(props: Props) {
  return (
    <AdminPage title={COPY.title}>
      <nav aria-label={COPY.title} className="flex flex-wrap gap-x-5 gap-y-3 border-b pb-3 text-sm">
        {tabs.map((tab) =>
          tab === props.filters.tab ? (
            <strong key={tab} aria-current="page">
              {COPY[tab]}
            </strong>
          ) : (
            <LinkTo key={tab} filters={{ tab }}>
              {COPY[tab]}
            </LinkTo>
          ),
        )}
      </nav>
      <Content {...props} />
    </AdminPage>
  )
}
