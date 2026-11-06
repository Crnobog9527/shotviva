import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { cn } from '../../ui/cn'
import type { TicketMessage, TicketThread } from '../types'
import { StatusChip } from './status-chip'

type Props = { thread: TicketThread; brand: string; notice?: ReactNode; form: ReactNode }

// One ticket: its state, the messages in order, then the field to add to it. The Owner's
// messages carry the brand's name, the user's read "You".
export function ThreadView({ thread, brand, notice, form }: Props) {
  const t = useTranslations('app.support')
  const format = useFormatter()
  return (
    <div className="grid gap-4 px-4 pt-3 pb-16">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-caption text-muted-foreground">
          {t('opened', { date: new Date(thread.createdAt) })}
        </span>
        <StatusChip status={thread.status} />
      </div>
      {notice}
      <ol className="grid gap-3">
        {thread.messages.map((message) => (
          <li key={message.id}>
            <MessageCard message={message} brand={brand} when={format.dateTime(new Date(message.createdAt), { dateStyle: 'medium', timeStyle: 'short' })} />
          </li>
        ))}
      </ol>
      {form}
    </div>
  )
}

function MessageCard({ message, brand, when }: { message: TicketMessage; brand: string; when: string }) {
  const t = useTranslations('app.support.thread')
  const fromTeam = message.author === 'admin'
  return (
    <article className={cn('hairline-lit grid gap-2 rounded-panel p-4', fromTeam ? 'bg-card' : 'bg-wash')}>
      <header className="flex items-baseline justify-between gap-3">
        <span className={cn('text-label font-semibold', fromTeam && 'text-primary')}>
          {fromTeam ? t('team', { brand }) : t('you')}
        </span>
        <span className="font-mono text-caption text-muted-foreground">{when}</span>
      </header>
      <p className="text-body leading-[1.5] break-words whitespace-pre-wrap">{message.body}</p>
    </article>
  )
}
