'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Link } from '@/core/i18n/ui'
import { STATE_GHOST } from '@/core/ui/empty-state'

import type { AgainContext } from '../../again/again-context'
import { makeAgainHref } from '../../again/again-start'
import { EditPhoto } from '../../edit-ui/edit-photo'
import { FormAction } from '../../workspace/form-action'
import { useWorkspaceDraft } from '../../workspace/use-workspace-draft'
import { WorkspaceForm } from '../../workspace/workspace-form'
import type { PhotoItem } from '../photo-item'
import { forgetWorkViews } from './use-work-view'
import { BackToWork } from './viewer-bits'
import { useViewer } from './viewer-context'
import { VIEWER_GRID } from './viewer-frame'

type Loaded = { kind: 'loading' } | { kind: 'ready'; context: AgainContext } | { kind: 'failed' }

// Make again (T40) in place of the work: the creation form the workspace page and the create
// dialog render, opened on this work's settings and kept photo (copied back on the server when
// this opens, as the workspace page does). Generate queues the photo and closes the viewer onto
// Photos, where it develops at the top under "In progress": no trip to another page.
export function WorkAgain({ item, onBack }: { item: PhotoItem; onBack(): void }) {
  const viewer = useViewer()
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })
  const prepare = viewer?.actions.prepareAgain
  useEffect(() => {
    if (!prepare) return
    let live = true
    prepare(item.id).then(
      (context) => live && setLoaded(context ? { kind: 'ready', context } : { kind: 'failed' }),
      () => live && setLoaded({ kind: 'failed' }),
    )
    return () => {
      live = false
    }
  }, [prepare, item.id])
  return (
    <div className={VIEWER_GRID}>
      <div className="flex-none px-4 md:flex md:min-h-0 md:flex-col md:justify-center md:overflow-y-auto md:bg-card md:p-6 md:shadow-[inset_-1px_0_0_var(--border)]">
        {item.thumbUrl ? <EditPhoto src={item.thumbUrl} className="h-[120px] md:mx-auto md:aspect-[4/5] md:h-auto md:max-h-[560px] md:w-full md:max-w-[448px]" /> : null}
      </div>
      <section aria-labelledby="viewer-again-h" aria-busy={loaded.kind === 'loading'} className="flex flex-col px-4 pt-4 md:min-h-0 md:px-6 md:pt-3 md:pb-6">
        <BackToWork onBack={onBack} className="-ml-1 hidden self-start md:inline-flex" />
        <h2 id="viewer-again-h" className="font-display text-h1 leading-[1.05] md:mt-2">{item.templateName}</h2>
        {loaded.kind === 'ready' ? <AgainForm context={loaded.context} /> : loaded.kind === 'failed' ? <AgainFailed item={item} /> : <AgainLoading />}
      </section>
    </div>
  )
}

function AgainForm({ context }: { context: AgainContext }) {
  const viewer = useViewer()
  const draft = useWorkspaceDraft({ ...context, single: true })
  const generate = () => {
    void draft.start()
    forgetWorkViews()
    viewer?.close()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <>
      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain [&>section:first-child]:pt-0">
        <WorkspaceForm template={context.template} balance={context.balance} tier={context.tier} photos={draft.photos} values={draft.values} onChange={draft.change} again={context.again} />
      </div>
      <div className="sticky bottom-0 z-10 md:static">
        <FormAction
          state={draft.state}
          resolution={draft.values.resolution}
          batch={false}
          addFirst={draft.missingPhoto ? context.template.creditsCost[draft.values.resolution] : null}
          limit={context.concurrency.limit}
          onGenerate={generate}
          placement="sheet"
        />
      </div>
    </>
  )
}

function AgainLoading() {
  const t = useTranslations('app.photos.viewer')
  return (
    <div className="mt-4 grid gap-3">
      <p className="text-caption text-muted-foreground">{t('againPreparing')}</p>
      <span aria-hidden="true" className="h-40 animate-pulse rounded-panel bg-wash motion-reduce:animate-none" />
      <span aria-hidden="true" className="h-24 rounded-panel bg-wash" />
    </div>
  )
}

// The work or its template went away, or the copy failed: the workspace page still works.
function AgainFailed({ item }: { item: PhotoItem }) {
  const t = useTranslations('app.photos.viewer')
  return (
    <div className="mt-4 grid justify-items-start gap-3">
      <p role="alert" className="text-body text-muted-foreground">{t('againFailed')}</p>
      <Link href={makeAgainHref(item.templateId, item.id)} prefetch={false} className={STATE_GHOST}>
        {t('againPage')}
      </Link>
    </div>
  )
}
