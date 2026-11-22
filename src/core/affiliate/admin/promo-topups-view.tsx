import { formatBeijing } from '@/core/admin/shell'
import { UserLink } from '@/core/admin/users-ui'
import type { SaveAction } from './form'
import { GridTable, Section } from './parts'
import { PROMO_COPY as P } from './promo-copy'
import type { PromoPartner, PromoSheet } from './promo-read'
import { TOPUP_COPY as T } from './promo-topup-copy'
import { PromoTopupForm } from './promo-topup-form'
import { topupsOf, type PromoTopup } from './promo-topup-read'

// The 「临时追加」 section (ARCHITECTURE §6.5 渠道商推广积分): one card per active channel partner with
// this month's sheet, the month's top-ups (amount, reason, who, when, expiry), the month's total
// and the top-up form.

const n = (value: number) => value.toLocaleString('zh-CN')
const short = (id: string) => id.slice(0, 8)

function sheetLine(s: PromoSheet | undefined): string {
  if (!s) return T.sheetNone
  const status = P.status[s.status] ?? s.status
  return s.status === 'granted' ? `${n(s.total)}（${status}）` : T.sheetNotGranted(status)
}

function TopupList({ list }: { list: PromoTopup[] }) {
  if (list.length === 0) return <p className="text-sm text-muted-foreground">{T.noTopups}</p>
  return (
    <GridTable
      heads={[T.credits, T.why, T.who, T.when, T.expires]}
      rows={list.map((t) => ({
        key: t.id,
        cells: [
          n(t.credits),
          <span key="r" className="break-words">{t.reason}</span>,
          <UserLink key="u" userId={t.created_by} className="font-mono text-xs">{short(t.created_by)}</UserLink>,
          formatBeijing(t.created_at),
          t.expired_credits === null ? formatBeijing(t.expires_at) : `${formatBeijing(t.expires_at)} · ${T.expired(t.expired_credits)}`,
        ],
      }))}
    />
  )
}

type CardProps = { partner: PromoPartner; sheet?: PromoSheet; topups: PromoTopup[]; period: string; action: SaveAction }

function PartnerTopups({ partner, sheet, topups, period, action }: CardProps) {
  const { list, sum } = topupsOf(topups, partner.id, period)
  const granted = sheet?.status === 'granted' ? sheet.total : 0
  return (
    <article className="grid min-w-0 gap-3 rounded-lg border p-4">
      <h3 className="font-semibold break-words">{partner.name}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{T.sheet}</dt>
        <dd className="min-w-0 break-words">{sheetLine(sheet)}</dd>
        <dt className="text-muted-foreground">{T.topups}</dt>
        <dd>{n(sum)}</dd>
        <dt className="text-muted-foreground">{T.monthTotal}</dt>
        <dd><strong className="text-base">{n(granted + sum)}</strong></dd>
      </dl>
      <TopupList list={list} />
      <PromoTopupForm action={action} orgId={partner.id} orgName={partner.name} recipient={partner.owner_user_id} period={period} />
    </article>
  )
}

type Props = { partners: PromoPartner[]; sheets: PromoSheet[]; topups: PromoTopup[]; period: string; action: SaveAction }

export function PromoTopups({ partners, sheets, topups, period, action }: Props) {
  const active = partners.filter((p) => p.promo_partner && p.status === 'active')
  return (
    <Section title={`${T.title}（${period}）`}>
      <p className="text-sm text-muted-foreground">{T.intro}</p>
      {active.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-muted-foreground">{T.noPartners}</p>
      ) : (
        active.map((p) => (
          <PartnerTopups key={p.id} partner={p} sheet={sheets.find((s) => s.org_id === p.id && s.period === period)}
            topups={topups} period={period} action={action} />
        ))
      )}
    </Section>
  )
}
