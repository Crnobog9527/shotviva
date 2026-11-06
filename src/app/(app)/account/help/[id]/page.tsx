import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AppPage, FlowNav } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { BASE_SUPPORT_REPLY_HOURS } from '@/core/billing'
import { loadMyThread, markTicketSeen } from '@/core/support'
import { AddMessageForm, ThreadView } from '@/core/support/ui'
import { site } from '@/site/site.config'

import { addMessageAction } from '../actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.support'))('title') }
}

// "Thanks, we've got it" after sending, with the reply time from the tier benefits.
async function SentNotice() {
  const t = await getTranslations('app.support')
  return (
    <p role="status" className="hairline-lit rounded-panel bg-card p-4 text-body">
      {t('thread.sent')} {t('replyTime', { hours: BASE_SUPPORT_REPLY_HOURS })}
    </p>
  )
}

// Opening the ticket clears its dot: read through RLS (someone else's ticket is a 404) and mark
// it seen in parallel; mark_ticket_seen only touches the author's own ticket.
async function Thread({ params, searchParams }: PageProps<'/account/help/[id]'>) {
  const [{ id }, { sent }] = await Promise.all([params, searchParams])
  const user = await requireUser(`/account/help/${id}`)
  const [thread, t] = await Promise.all([
    loadMyThread(await createServerSupabase(), id),
    getTranslations('app.support'),
    markTicketSeen(createAdminSupabase(), user.id, id),
  ])
  if (!thread) notFound()
  return (
    <>
      <FlowNav back={{ href: '/account/help', label: t('title') }} title={t(`types.${thread.type}`)} />
      <h1 className="px-4 pt-2 font-display text-h1 leading-tight">{t(`types.${thread.type}`)}</h1>
      <ThreadView
        thread={thread}
        brand={site.brand.name}
        notice={sent === '1' ? <SentNotice /> : undefined}
        form={<AddMessageForm send={addMessageAction.bind(null, thread.id)} closed={thread.status === 'closed'} />}
      />
    </>
  )
}

export default function TicketPage(props: PageProps<'/account/help/[id]'>) {
  return (
    <AppPage>
      <Suspense>
        <Thread {...props} />
      </Suspense>
    </AppPage>
  )
}
