import type { SupabaseClient } from '@supabase/supabase-js'
import { ConsumerReferral } from './consumer-referral'
import { COPY, STATUS, money } from './copy'
import type { SaveAction } from './form'
import { enrollmentLabel } from './enrollment'
import { CreateMember } from './create-member'
import { DecideMember, SetMember, Adjust } from './member-forms'
import { Field, FiltersForm, GridTable, LinkTo, NextPage, Section } from './parts'
import type { Filters } from './query'
import { countryName } from '../partners/application-options'
import { loadMember, members, referred, adjustments, type Member } from './read'

export type ViewProps = { db: SupabaseClient; filters: Filters; action: SaveAction }
export async function MembersView({ db, filters, action }: ViewProps) {
  if (filters.id) return <MemberView db={db} filters={filters} action={action} id={filters.id} />
  const result = await members(db, filters)
  return (
    <>
      {filters.tab === 'affiliates' && <CreateMember />}
      <FiltersForm tab={filters.tab}>
        <Field label={COPY.search} name="q" defaultValue={filters.q} />
      </FiltersForm>
      <GridTable
        heads={[COPY.slug, COPY.account, COPY.status, COPY.date]}
        rows={result.items.map((r) => ({
          key: r.id,
          cells: [
            <LinkTo key="link" filters={{ tab: filters.tab, id: r.id }}>
              {r.slug}
            </LinkTo>,
            r.user_id,
            enrollmentLabel(r),
            r.created_at.slice(0, 10),
          ],
        }))}
      />
      <NextPage filters={filters} cursor={result.nextCursor} />
    </>
  )
}
// A stored option key in words; an older free-text answer is shown as written.
const label = (words: Record<string, string>, value: unknown) => (typeof value === 'string' ? words[value] ?? value : value)

function ProfileFacts({ member: m }: { member: Member }) {
  const app = m.application ?? {}
  const rows = [
    [COPY.account, m.user_id],
    [COPY.status, enrollmentLabel({ status: m.status, source: app.source })],
    [COPY.name, app.name],
    [COPY.country, m.country && countryName(m.country, 'zh')],
    [COPY.channelType, label(COPY.channelTypes, app.channel_type)],
    [COPY.channels, app.channel],
    [COPY.otherChannels, app.other_channels],
    [COPY.audience, label(COPY.audienceRanges, app.audience)],
    [COPY.plan, app.plan],
    [COPY.contact, app.contact],
    [COPY.reason, m.reject_reason],
    [COPY.payoutMethod, m.payout_method && STATUS[m.payout_method]],
    [COPY.payoutDetails, m.payout_details],
    [COPY.tax, m.us_person === null ? null : m.us_person ? COPY.yes : COPY.no],
    [COPY.termsVersion, m.terms_version],
    [COPY.agreed, m.terms_accepted_at],
  ]
  return (
    <dl className="grid gap-2 rounded border p-4 text-sm md:grid-cols-2">
      {rows.map(([key, value]) => (
        <div key={String(key)} className="grid min-w-0 gap-1">
          <dt className="text-muted-foreground">{String(key)}</dt>
          <dd className="break-words">{value == null ? COPY.none : String(value)}</dd>
        </div>
      ))}
    </dl>
  )
}
async function MemberView({ db, filters, action, id }: ViewProps & { id: string }) {
  const { member, rates } = await loadMember(db, id)
  if (!member) return <p>{COPY.noAffiliate}</p>
  const links = { tab: 'affiliates' as const, id }
  return (
    <>
      <LinkTo filters={{ tab: filters.tab }}>{COPY.previous}</LinkTo>
      <Section title={member.slug}>
        <ProfileFacts member={member} />
        {member.status === 'active' && <ConsumerReferral slug={member.slug} />}
      </Section>
      {member.status === 'pending' && <DecideMember member={member} action={action} />}
      {['active', 'suspended', 'banned'].includes(member.status) && <SetMember member={member} rates={rates} action={action} />}
      <nav className="flex flex-wrap gap-4">
        <LinkTo filters={{ ...links, section: 'referrals' }}>{COPY.referrals}</LinkTo>
        <LinkTo filters={{ tab: 'commissions', affiliate: id }}>{COPY.commissions}</LinkTo>
        <LinkTo filters={{ ...links, section: 'adjustments' }}>{COPY.adjustments}</LinkTo>
        <LinkTo filters={{ tab: 'payouts', affiliate: id }}>{COPY.payouts}</LinkTo>
        <LinkTo filters={{ tab: 'commissions', affiliate: id, flag: 'yes' }}>{COPY.flagged}</LinkTo>
      </nav>
      {filters.section === 'adjustments' ? (
        <>
          <Adjust id={id} action={action} />
          <Adjustments db={db} id={id} filters={filters} />
        </>
      ) : (
        <Referrals db={db} id={id} filters={filters} />
      )}
    </>
  )
}
async function Adjustments({ db, id, filters }: Omit<ViewProps, 'action'> & { id: string }) {
  const r = await adjustments(db, id, filters.cursor)
  return (
    <Section title={COPY.adjustments}>
      <GridTable
        heads={[COPY.date, COPY.amount, COPY.reason]}
        rows={r.items.map((e) => ({
          key: e.id,
          cells: [e.created_at.slice(0, 10), money(e.amount), e.reason],
        }))}
      />
      <NextPage filters={filters} cursor={r.nextCursor} />
    </Section>
  )
}
async function Referrals({ db, id, filters }: Omit<ViewProps, 'action'> & { id: string }) {
  const r = await referred(db, id, filters.cursor)
  return (
    <Section title={COPY.referrals}>
      <GridTable
        heads={[COPY.account, COPY.activeDate, COPY.source]}
        rows={r.items.map((e) => ({
          key: e.id,
          cells: [
            <LinkTo key="user" filters={{ tab: 'attribution', q: e.id }}>
              {e.id}
            </LinkTo>,
            e.referred_at.slice(0, 10),
            STATUS[e.referred_source],
          ],
        }))}
      />
      <NextPage filters={filters} cursor={r.nextCursor} />
    </Section>
  )
}
