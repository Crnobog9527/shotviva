import { getTranslations } from 'next-intl/server'
import { currentLocale } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
import { date, money, percent, productLabel, viewHref } from './format'
import type { Query } from './models'
import { readChanges, readCommissions } from './repository'
import { More, Table } from './shared-ui'

async function ChangeList({ user, query }: { user: string; query: Query }) {
  if (!query.entry) return null
  const [page, t, locale] = await Promise.all([
    readChanges(user, query.entry, query.changes),
    getTranslations('affiliate'),
    currentLocale(),
  ])
  return (
    <section className="af-panel">
      <h3>{t('changes')}</h3>
      <Table
        headers={['date', 'reason', 'previous', 'updated'].map((key) => t(key))}
        empty={t('empty')}
        rows={page.items.map((row) => [
          date(locale, row.at),
          t.has('reasonCode.' + row.reason) ? t('reasonCode.' + row.reason) : t('change'),
          row.old_status
            ? t('amountStatus', {
                amount: money(locale, row.old_amount ?? 0),
                status: t('status.' + row.old_status),
              })
            : '—',
          t('amountStatus', { amount: money(locale, row.new_amount), status: t('status.' + row.new_status) }),
        ])}
      />
      <More query={query} next={page.nextCursor} field="changes" />
    </section>
  )
}
export async function CommissionList({
  user,
  query,
  team = false,
}: {
  user: string
  query: Query
  team?: boolean
}) {
  const [page, t, locale] = await Promise.all([
    readCommissions(user, team ? query.bonus : query.cursor, team),
    getTranslations('affiliate'),
    currentLocale(),
  ])
  return (
    <section className="af-section">
      <div className="af-heading">
        <h2>{t(team ? 'bonuses' : 'nav.commissions')}</h2>
        {!team && (
          <a href={'/api/affiliate/commissions?locale=' + locale} className="af-link">
            {t('export')}
          </a>
        )}
      </div>
      <Table
        headers={['date', 'item', 'base', 'rate', 'commission', 'state', 'confirms', 'changes'].map((key) =>
          t(key),
        )}
        empty={t('empty')}
        rows={page.items.map((row) => [
          date(locale, row.created_at),
          productLabel(row.product_id, t),
          money(locale, row.base_usd),
          percent(locale, row.rate_bp),
          money(locale, row.amount),
          t('status.' + row.status),
          date(locale, row.confirm_after),
          <Link
            key={row.id}
            className="af-link"
            href={viewHref({ ...query, entry: String(row.id), changes: undefined })}
          >
            {t('detailsLink')}
          </Link>,
        ])}
      />
      <More
        query={{ ...query, entry: undefined, changes: undefined }}
        next={page.nextCursor}
        field={team ? 'bonus' : 'cursor'}
      />
      <ChangeList user={user} query={query} />
    </section>
  )
}
