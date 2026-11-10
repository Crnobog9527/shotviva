import Link from 'next/link'
import { formatBeijing } from '@/core/admin/shell'
import { COPY, DOSSIER, STATUS, money } from './copy'
import { DossierCommissions } from './dossier-commissions'
import { DirectoryTable } from './dossier-directory'
import { dossierAudit, dossiers } from './dossier-read'
import { snapshotText } from './financial-view'
import { Adjust } from './member-forms'
import type { DossierProps } from './members-view'
import { GridTable, LinkTo, NextPage } from './parts'
import { payoutAmountHeaders, payoutAmounts } from './payout-amounts'
import { DecidePayout } from './payout-decision'
import { dossierSections, href, type Filters } from './query'
import { adjustments, payouts, referred } from './read'

function DossierNav({ filters }: { filters: Filters }) {
  return (
    <nav aria-label={DOSSIER.records} className="flex flex-wrap gap-1 border-b pb-2">
      {dossierSections.map((section) => (
        <Link key={section} prefetch={false}
          href={href({ tab: filters.tab, id: filters.id, review: filters.review, section }) + '#affiliate-records'}
          aria-current={section === (filters.section ?? 'commissions') ? 'page' : undefined}
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground">
          {DOSSIER.sections[section]}
        </Link>
      ))}
    </nav>
  )
}

async function Team({ db, id, actor, filters }: DossierProps) {
  const page = await dossiers(db, actor, { parent: id, cursor: filters.cursor })
  return <>
    <DirectoryTable items={page.items} filters={{ tab: 'affiliates' }} />
    <NextPage filters={filters} cursor={page.nextCursor} />
  </>
}

async function Payouts({ db, filters, action, id }: DossierProps) {
  const page = await payouts(db, { tab: 'payouts', affiliate: id, cursor: filters.cursor })
  return <>
    <GridTable heads={[COPY.id, COPY.period, ...payoutAmountHeaders, COPY.status, COPY.payoutSnapshot, COPY.complete]}
      rows={page.items.map(r => ({ key: r.id, cells: [r.id, r.period, ...payoutAmounts(r, money, '—'), STATUS[r.status],
        snapshotText(r), <DecidePayout key="action" r={r} action={action} />] }))} />
    <NextPage filters={filters} cursor={page.nextCursor} />
  </>
}

async function Referrals({ db, id, filters }: DossierProps) {
  const page = await referred(db, id, filters.cursor)
  return <>
    <GridTable heads={[COPY.account, COPY.activeDate, COPY.source]} rows={page.items.map(r => ({ key: r.id, cells: [
      <LinkTo key="user" filters={{ tab: 'attribution', q: r.id }}>{r.id}</LinkTo>,
      formatBeijing(r.referred_at), STATUS[r.referred_source] ?? r.referred_source,
    ] }))} />
    <NextPage filters={filters} cursor={page.nextCursor} />
  </>
}

async function Audit({ db, id, filters, actor }: DossierProps) {
  const page = await dossierAudit(db, actor, id, filters.cursor)
  return <>
    <GridTable heads={[DOSSIER.at, DOSSIER.operation, DOSSIER.actor, DOSSIER.target, COPY.actualReason]}
      rows={page.items.map(r => ({ key: r.id, cells: [formatBeijing(r.created_at), DOSSIER.actions[r.action] ?? r.action,
        r.user_id ?? '—', r.target_id ?? '—', r.reason === r.action ? '—' : r.reason] }))} />
    <NextPage filters={filters} cursor={page.nextCursor} />
  </>
}

async function Adjustments({ db, filters, id, action }: DossierProps) {
  const page = await adjustments(db, id, filters.cursor)
  return <>
    <Adjust id={id} action={action} />
    <GridTable heads={[DOSSIER.at, COPY.amount, COPY.reason]} rows={page.items.map(r => ({
      key: r.id, cells: [formatBeijing(r.created_at), money(r.amount), r.reason],
    }))} />
    <NextPage filters={filters} cursor={page.nextCursor} />
  </>
}

function Records(props: DossierProps) {
  switch (props.filters.section) {
    case 'bonuses': return <DossierCommissions {...props} level={2} />
    case 'team': return <Team {...props} />
    case 'payouts': return <Payouts {...props} />
    case 'referrals': return <Referrals {...props} />
    case 'audit': return <Audit {...props} />
    case 'adjustments': return <Adjustments {...props} />
    default: return <DossierCommissions {...props} level={1} />
  }
}

export function DossierSections(props: DossierProps) {
  return (
    <section id="affiliate-records" className="grid scroll-mt-4 gap-4">
      <DossierNav filters={props.filters} />
      <h2 className="text-lg font-semibold">{DOSSIER.sections[props.filters.section ?? 'commissions']}</h2>
      <Records {...props} />
    </section>
  )
}
