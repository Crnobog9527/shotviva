import { getTranslations } from 'next-intl/server'
import { currentLocale } from '@/core/i18n/server'
import { date, money } from './format'
import type { Query } from './models'
import { CommissionTable } from './commission-table'
import { readChanges, readCommissions, readOrderFees } from './repository'
import { More, Table } from './shared-ui'

async function ChangeList({ user, query }: { user: string; query: Query }) {
  if (!query.entry) return null
  const [page, t, locale] = await Promise.all([
    readChanges(user, query.entry, query.changes),
    getTranslations('affiliate'),
    currentLocale(),
  ])
  return (
    <section className="af-panel af-history">
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
  const orders = await readOrderFees(page.items)
  return (
    <section className="af-section">
      <div className="af-heading">
        <h2>{t(team ? 'bonuses' : 'nav.commissions')}</h2>
        {!team && (
          <a href={'/api/affiliate/commissions?locale=' + locale} className="af-ghost">
            {t('export')}
          </a>
        )}
      </div>
      <CommissionTable rows={page.items} orders={orders} query={query} locale={locale} t={t} />
      <More
        query={{ ...query, entry: undefined, changes: undefined }}
        next={page.nextCursor}
        field={team ? 'bonus' : 'cursor'}
      />
      <ChangeList user={user} query={query} />
    </section>
  )
}
