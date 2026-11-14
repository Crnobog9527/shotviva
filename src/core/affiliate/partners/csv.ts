import 'server-only'
import { getTranslations } from 'next-intl/server'
import { requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import type { Locale } from '@/core/i18n'
import { isAffiliateEnabled } from '../feature'
import { productLabel } from './format'
import type { Commission } from './models'
import { readAccount, readCommissions } from './repository'

function csvCell(value: string) {
  // Quoting handles delimiters; spreadsheets still treat a quoted leading '=' as a formula.
  const safe = /^[=+@\-\t\r]/.test(value) ? "'" + value : value
  return '"' + safe.replaceAll('"', '""') + '"'
}
function line(values: string[]) {
  return values.map(csvCell).join(',') + '\r\n'
}

async function* commissionPages(user: string) {
  let cursor: string | null = null
  do {
    const page = await readCommissions(user, cursor)
    yield page.items
    cursor = page.nextCursor
  } while (cursor)
}

export async function exportCommissions(locale: Locale) {
  if (!(await isAffiliateEnabled())) throw new AppError('NOT_FOUND', 'Not found')
  const user = await requireApiUser()
  const account = await readAccount(user.id)
  if (account?.status !== 'active') throw new AppError('NOT_FOUND', 'Not found')
  const t = await getTranslations({ locale, namespace: 'affiliate' })
  const header = line(['date', 'item', 'base', 'rate', 'commission', 'state', 'confirms'].map((key) => t(key)))
  const row = (r: Commission) =>
    line([
      r.created_at,
      productLabel(r.product_id, t),
      (r.base_usd / 100).toFixed(2),
      r.rate_bp / 100 + '%',
      (r.amount / 100).toFixed(2),
      t('status.' + r.status),
      r.confirm_after,
    ])
  const pages = commissionPages(user.id)
  const first = await pages.next()
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('\uFEFF' + header + (first.value ?? []).map(row).join('')))
    },
    async pull(controller) {
      const page = await pages.next()
      if (page.done) controller.close()
      else controller.enqueue(encoder.encode(page.value.map(row).join('')))
    },
    async cancel() {
      await pages.return(undefined)
    },
  })
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="commissions.csv"',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
