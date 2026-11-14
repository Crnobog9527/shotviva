import type { ReactNode } from 'react'
import { formatBeijing } from '@/core/admin/shell'
import { countryName } from '../partners/application-options'
import { COPY, DOSSIER, STATUS } from './copy'
import type { DossierDetail } from './dossier-read'
import { LinkTo } from './parts'

type Fact = readonly [string, ReactNode]

function Facts({ title, rows }: { title: string; rows: Fact[] }) {
  return (
    <section className="min-w-0 rounded-md border p-4">
      <h3 className="mb-3 font-medium">{title}</h3>
      <dl className="grid gap-3 text-sm">
        {rows.map(([key, value]) => (
          <div key={key} className="grid gap-1">
            <dt className="text-xs text-muted-foreground">{key}</dt>
            <dd className="break-words whitespace-pre-line">{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function stored(value: unknown, choices?: Record<string, string>) {
  if (typeof value !== 'string') return null
  return choices?.[value] ?? value
}

export function ProfileFacts({ member: m }: { member: DossierDetail }) {
  const app = m.application ?? {}
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Facts title={DOSSIER.accountProfile} rows={[
        [COPY.name, m.name], [DOSSIER.email, m.email], [DOSSIER.phone, m.phone], [COPY.account, m.user_id],
        [DOSSIER.registered, formatBeijing(m.registered_at)], [DOSSIER.enrolled, formatBeijing(m.created_at)],
        [DOSSIER.approved, formatBeijing(m.approved_at)], [DOSSIER.approvedBy, m.approved_by],
        [DOSSIER.parent, m.parent_user_id && <LinkTo filters={{ tab: 'affiliates', id: m.parent_user_id }}>{m.parent_user_id}</LinkTo>],
      ]} />
      <Facts title={COPY.applicant} rows={[
        [COPY.country, m.country && countryName(m.country, 'zh')],
        [COPY.channelType, stored(app.channel_type, COPY.channelTypes)], [COPY.channels, stored(app.channel)],
        [COPY.otherChannels, stored(app.other_channels)], [COPY.audience, stored(app.audience, COPY.audienceRanges)],
        [COPY.plan, stored(app.plan)], [COPY.contact, stored(app.contact)],
        ...(m.reject_reason ? [[COPY.reason, m.reject_reason] as const] : []),
        ...(m.admin_note ? [[DOSSIER.adminNote, m.admin_note] as const] : []),
      ]} />
      <Facts title={DOSSIER.payoutProfile} rows={[
        [COPY.payoutMethod, m.payout_method && (STATUS[m.payout_method] ?? m.payout_method)], [COPY.payoutDetails, m.payout_details],
        [COPY.tax, m.us_person === null ? null : m.us_person ? COPY.yes : COPY.no], [COPY.termsVersion, m.terms_version],
        [COPY.agreed, formatBeijing(m.terms_accepted_at)],
      ]} />
    </div>
  )
}
