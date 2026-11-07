'use client'

import { ChevronLeftIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, type ReactNode } from 'react'

import { EmptyState } from '../../ui/empty-state'
import { AddMessageForm } from './add-message-form'
import type { HelpActions } from './help-actions'
import { HelpLoadFailed, HelpLoading } from './help-states'
import { ThreadView } from './thread-view'
import { useLoad } from './use-load'

type Props = {
  id: string
  actions: Pick<HelpActions, 'loadThread' | 'addMessage'>
  brand: string
  // "Thanks, we've got it" with the reply time, right after the ticket was sent.
  notice: ReactNode
  onBack(): void
}

// One ticket in the dialog: back to My tickets, the type as the heading, the messages and the
// reply field. Reading it marks it seen (loadThread), which clears its dot.
export function HelpThreadView({ id, actions, brand, notice, onBack }: Props) {
  const t = useTranslations('app.support')
  const { loadThread, addMessage } = actions
  const thread = useLoad(useCallback(() => loadThread(id), [loadThread, id]))
  const send = useCallback((state: Parameters<typeof addMessage>[1], data: FormData) => addMessage(id, state, data), [addMessage, id])
  let body: ReactNode
  if (thread.failed && thread.data === undefined) body = <HelpLoadFailed retry={thread.reload} />
  else if (thread.data === undefined) body = <HelpLoading />
  else if (thread.data === null) body = <EmptyState icon="missing" title={t('thread.errors.NOT_FOUND')} body={t('notFoundBody')} className="mx-0 md:mx-0" />
  else {
    const data = thread.data
    body = (
      <>
        <h3 className="pt-2 text-headline font-semibold">{t(`types.${data.type}`)}</h3>
        <ThreadView
          thread={data}
          brand={brand}
          notice={notice}
          form={<AddMessageForm send={send} closed={data.status === 'closed'} onSent={thread.reload} />}
        />
      </>
    )
  }
  return (
    <div className="pt-3">
      <button type="button" onClick={onBack} className="press -ml-2 inline-flex min-h-11 items-center gap-1 rounded-button px-2 text-label font-semibold text-bone-dim">
        <ChevronLeftIcon className="size-4" strokeWidth={2.2} aria-hidden="true" />
        {t('tabs.mine')}
      </button>
      {body}
    </div>
  )
}
