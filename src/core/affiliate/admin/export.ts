import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { commissions, payouts, type Commission, type Payout } from './read'
import { COPY, STATUS, commissionStatus } from './copy'
import type { Filters } from './query'

function cell(value: string | number) {
  // A CSV opened in a spreadsheet must treat user-entered bank details and notes as text.
  const raw = String(value)
  const text = typeof value === 'string' && /^[\s\uFEFF]*[=+@\-]/.test(raw) ? "'" + raw : raw
  return '"' + text.replaceAll('"', '""') + '"'
}
export const csvLine = (values: (string | number)[]) => values.map(cell).join(',') + '\r\n'
const commissionHeaders = [
  COPY.id,
  COPY.payment,
  COPY.date,
  COPY.affiliateId,
  COPY.product,
  COPY.type,
  COPY.amountBeforeTax,
  COPY.pct,
  COPY.commission,
  COPY.status,
  COPY.flag,
  COPY.confirmedAt,
]
const payoutHeaders = [
  COPY.id,
  COPY.period,
  COPY.date,
  COPY.affiliateId,
  COPY.amount,
  COPY.status,
  COPY.payoutMethod,
  COPY.payoutDetails,
  COPY.paidAt,
  COPY.actualMethod,
  COPY.reference,
  COPY.note,
]
const cents = (n: number) => (n / 100).toFixed(2)
function commissionCells(r: Commission) {
  return [
    r.id,
    r.payment_id,
    r.created_at,
    r.affiliate_user_id,
    r.product_id,
    r.level === 2 ? COPY.teamBonus : COPY.selfCommission,
    cents(r.base_usd),
    r.rate_bp / 100,
    cents(r.amount),
    commissionStatus(r.status),
    r.flags.map((s) => STATUS[s] ?? s).join('、'),
    r.confirm_after,
  ]
}
function payoutCells(r: Payout) {
  const s = r.payout_snapshot
  const method = String(s.payout_method ?? '')
  return [
    r.id,
    r.period,
    r.created_at,
    r.affiliate_user_id,
    cents(r.amount),
    STATUS[r.status] ?? r.status,
    STATUS[method] ?? method,
    String(s.payout_details ?? ''),
    r.paid_at ?? '',
    r.paid_method ?? '',
    r.paid_reference ?? '',
    r.note ?? '',
  ]
}
async function getPage(db: SupabaseClient, f: Filters) {
  if (f.tab === 'payouts') {
    const page = await payouts(db, f)
    return { lines: page.items.map((r) => csvLine(payoutCells(r))), cursor: page.nextCursor }
  }
  const page = await commissions(db, f)
  return { lines: page.items.map((r) => csvLine(commissionCells(r))), cursor: page.nextCursor }
}
export async function exportCsv(db: SupabaseClient, f: Filters) {
  const first = await getPage(db, { ...f, cursor: undefined })
  const encoder = new TextEncoder()
  let page = first
  let firstChunk = true
  const body = new ReadableStream<Uint8Array>({
    async pull(stream) {
      const header = firstChunk ? '\uFEFF' + csvLine(f.tab === 'payouts' ? payoutHeaders : commissionHeaders) : ''
      if (!firstChunk && page.cursor) page = await getPage(db, { ...f, cursor: page.cursor })
      stream.enqueue(encoder.encode(header + page.lines.join('')))
      firstChunk = false
      if (!page.cursor) stream.close()
    },
  })
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'attachment; filename="affiliate-' + f.tab + '.csv"',
    },
  })
}
