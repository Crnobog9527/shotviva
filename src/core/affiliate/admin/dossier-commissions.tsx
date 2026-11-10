import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { formatBeijing } from '@/core/admin/shell'
import { productLabel } from '../partners/format'
import { COPY, DOSSIER, commissionStatus, money } from './copy'
import { dossierChanges, dossierCommissions } from './dossier-read'
import type { DossierProps } from './members-view'
import { GridTable, LinkTo, NextPage } from './parts'
import { href } from './query'

type Props = DossierProps & { level: 1 | 2 }

async function History({ db, actor, filters, id, level }: Props) {
  if (!filters.commission) return null
  const [page, t] = await Promise.all([
    dossierChanges(db, actor, id, level, filters.commission, filters.historyCursor),
    getTranslations({ locale: 'zh', namespace: 'affiliate' }),
  ])
  return (
    <section id="commission-history" className="grid scroll-mt-4 gap-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{DOSSIER.historyFor(filters.commission)}</h3>
        <LinkTo filters={{ ...filters, commission: undefined, historyCursor: undefined }}>{DOSSIER.closeHistory}</LinkTo>
      </div>
      <GridTable heads={[DOSSIER.at, DOSSIER.earlier, DOSSIER.later, COPY.reason]} rows={page.items.map((row) => ({
        key: row.id,
        cells: [
          formatBeijing(row.at),
          row.old_status ? commissionStatus(row.old_status) + ' · ' + money(row.old_amount ?? 0) : '—',
          commissionStatus(row.new_status) + ' · ' + money(row.new_amount),
          row.reason === 'affiliate_inactive' ? DOSSIER.affiliateInactive :
            t.has('reasonCode.' + row.reason) ? t('reasonCode.' + row.reason) : row.reason,
        ],
      }))} />
      {page.nextCursor && <Link prefetch={false} className="text-sm text-primary hover:underline"
        href={href({ ...filters, historyCursor: page.nextCursor }) + '#commission-history'}>{COPY.next}</Link>}
    </section>
  )
}

export async function DossierCommissions(props: Props) {
  const { db, id, level, filters } = props
  const [page, t] = await Promise.all([
    dossierCommissions(db, id, level, filters.cursor),
    getTranslations({ locale: 'zh', namespace: 'affiliate' }),
  ])
  return (
    <>
      <GridTable
        heads={[DOSSIER.commissionId, COPY.payment, DOSSIER.at, COPY.product, ...(level === 2 ? [DOSSIER.directPromoter] : []),
          COPY.amountBeforeTax, COPY.pct, COPY.commission, COPY.status, DOSSIER.history]}
        rows={page.items.map((r) => ({
          key: r.id,
          cells: [
            r.id, r.payment_id, formatBeijing(r.created_at), productLabel(r.product_id, t),
            ...(level === 2 ? [r.direct
              ? <LinkTo key="direct" filters={{ tab: 'affiliates', id: r.direct.user_id }}>{r.direct.slug}</LinkTo>
              : '—'] : []),
            money(r.base_usd), r.rate_bp / 100 + '%', money(r.amount), commissionStatus(r.status),
            <Link key="changes" prefetch={false} className="text-primary hover:underline"
              href={href({ ...filters, commission: r.id, historyCursor: undefined }) + '#commission-history'}>{DOSSIER.history}</Link>,
          ],
        }))}
      />
      <NextPage filters={{ ...filters, commission: undefined, historyCursor: undefined }} cursor={page.nextCursor} />
      <History {...props} />
    </>
  )
}
