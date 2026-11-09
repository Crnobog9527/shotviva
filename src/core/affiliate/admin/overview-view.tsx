import { StatCard } from '@/core/admin'
import { COPY, STATUS, money } from './copy'
import { MutationForm } from './form'
import type { ViewProps } from './members-view'
import { Field, Hidden, Section, GridTable, FiltersForm, NextPage, Select, LinkTo } from './parts'
import { errors } from './read'
import { Rates } from './rates'
import { findUser, overview, settings } from './summary'

export async function OverviewView({ db, actor }: { db: ViewProps['db']; actor: string }) {
  const totals = await overview(db, actor)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(['revenue', 'pending', 'confirmed', 'paid'] as const).map((k) => (
        <StatCard key={k} title={COPY[k]} value={money(totals[k])} />
      ))}
      <LinkTo filters={{ tab: 'applications' }}>
        <StatCard title={COPY.applications} value={String(totals.applications)} />
      </LinkTo>
      <LinkTo filters={{ tab: 'payouts', status: 'due' }}>
        <StatCard
          title={COPY.payout_count}
          value={String(totals.payout_count)}
          hint={COPY.payout_total + ' ' + money(totals.payout_total)}
        />
      </LinkTo>
      <LinkTo filters={{ tab: 'commissions', flag: 'yes' }}>
        <StatCard title={COPY.flagged} value={String(totals.flagged)} />
      </LinkTo>
      <LinkTo filters={{ tab: 'errors' }}>
        <StatCard title={COPY.errors} value={String(totals.errors)} />
      </LinkTo>
    </div>
  )
}
export async function ErrorsView({ db, filters, action }: ViewProps) {
  const list = await errors(db, filters)
  return (
    <>
      <GridTable
        heads={[COPY.payment, COPY.date, COPY.description, COPY.complete]}
        rows={list.items.map((r) => ({
          key: r.id,
          cells: [
            r.payment_id,
            r.at,
            r.error,
            <MutationForm key="form" action={action} operation="recompute" label={COPY.recompute}>
              <Hidden name="payment_id" value={r.payment_id} />
            </MutationForm>,
          ],
        }))}
      />
      <NextPage filters={filters} cursor={list.nextCursor} />
    </>
  )
}
export async function SettingsView({ db, action }: Omit<ViewProps, 'filters'>) {
  const { settings: s, rates } = await settings(db)
  return (
    <MutationForm action={action} operation="settings" label={COPY.save}>
      <Rates values={rates} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="hold_days" label={COPY.confirmDays} type="number" min="0" step="1" required defaultValue={s.hold_days} />
        <Field
          name="payout_min_usd"
          label={COPY.minAmount}
          type="number"
          min=".01"
          step=".01"
          required
          defaultValue={s.payout_min_usd / 100}
        />
        <Field name="settlement_day" label={COPY.day} type="number" min="1" max="28" step="1" required defaultValue={s.settlement_day} />
        <Select
          name="apply_min_level"
          label={COPY.applyLevel}
          values={['none', 'any_paid', 'starter', 'pro', 'max']}
          initial={s.apply_min_level}
        />
        <Field name="terms_version" label={COPY.termsVersion} required defaultValue={s.terms_version} />
      </div>
    </MutationForm>
  )
}
export async function AttributionView({ db, filters, action, actor }: ViewProps & { actor: string }) {
  const u = filters.q ? await findUser(db, actor, filters.q) : null
  return (
    <>
      <FiltersForm tab="attribution">
        <Field label={COPY.userQuery} name="q" defaultValue={filters.q} required />
      </FiltersForm>
      {!u && filters.q && <p>{COPY.noUser}</p>}
      {u && <AttributionDetail u={u} action={action} />}
    </>
  )
}

function AttributionDetail({ u, action }: { u: NonNullable<Awaited<ReturnType<typeof findUser>>>; action: ViewProps['action'] }) {
  return (
    <Section title={u.email ?? u.user_id}>
      <GridTable
        heads={[COPY.account, COPY.referrer, COPY.activeDate, COPY.source]}
        rows={[
          {
            key: u.user_id,
            cells: [
              u.user_id,
              u.referred_by ? (
                <LinkTo key="member" filters={{ tab: 'affiliates', id: u.referred_by }}>
                  {u.slug ?? u.referred_by}
                </LinkTo>
              ) : (
                COPY.none
              ),
              u.referred_at?.slice(0, 10) ?? COPY.none,
              u.referred_source ? STATUS[u.referred_source] : COPY.none,
            ],
          },
        ]}
      />
      <MutationForm operation="rebind" action={action} label={COPY.rebind}>
        <Hidden name="user_id" value={u.user_id} />
        <Field name="affiliate_user_id" label={COPY.rebindTo} defaultValue={u.referred_by ?? ''} />
        <Field name="reason" label={COPY.reason} required maxLength={2000} />
      </MutationForm>
    </Section>
  )
}
