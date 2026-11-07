'use client'

import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

import { EmptyState, STATE_GHOST } from '../../ui/empty-state'
import type { TicketSummary } from '../types'
import type { HelpActions } from './help-actions'
import { HelpLoadFailed, HelpLoading } from './help-states'
import { TicketsList } from './tickets-list'
import { useLoad } from './use-load'

type Props = { load: HelpActions['loadTickets']; onOpen(ticket: TicketSummary): void; onNew(): void }

// My tickets: read fresh each time the tab opens, so a ticket just sent or a dot just cleared
// shows at once.
export function HelpListView({ load, onOpen, onNew }: Props) {
  const t = useTranslations('app.support')
  const first = useLoad(useCallback(() => load(null), [load]))
  if (first.failed && !first.data) return <HelpLoadFailed retry={first.reload} />
  if (!first.data) return <HelpLoading />
  if (first.data.items.length === 0) {
    return (
      <EmptyState
        title={t('empty')}
        body={t('emptyBody')}
        action={
          <button type="button" onClick={onNew} className={STATE_GHOST}>
            {t('tabs.new')}
          </button>
        }
        className="mx-0 md:mx-0"
      />
    )
  }
  return (
    <div className="pt-5 pb-[calc(var(--sab)+24px)] md:pb-6">
      <TicketsList first={first.data} loadMore={load} onOpen={onOpen} />
    </div>
  )
}
