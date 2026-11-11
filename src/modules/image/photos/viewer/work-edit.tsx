'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'

import { EditPhoto } from '../../edit-ui/edit-photo'
import type { EditDraft, EditSource } from '../../edit-ui/edit-source'
import { EditDeveloping, EditFailure } from '../../edit-ui/edit-states'
import { startEdit } from '../../edit-ui/start-edit'
import { useEditForm } from '../../edit-ui/use-edit-form'
import { retryJob } from '../../generation/job-store'
import { useJob } from '../../generation/use-jobs'
import type { WorkView } from '../work-view'
import { forgetWorkViews, preloadWorkView } from './use-work-view'
import { BackToWork } from './viewer-bits'
import { VIEWER_GRID } from './viewer-frame'

type Edit = NonNullable<WorkView['edit']>
type Props = { view: WorkView & { edit: Edit }; onBack(): void; onDone(id: string): void }

// Edit (ARCHITECTURE §5.2) in place of the work: the same form and bar as the edit panel, the
// photo kept in the tray. Generate develops the edit right here; once it is done and the new
// photo's view has loaded (so the viewer never stands empty), the viewer shows the new photo,
// and the grid under it gains it on the refresh the generation runner does.
// A failure offers Retry and Change the request, with the words kept.
export function WorkEdit({ view, onBack, onDone }: Props) {
  const t = useTranslations('app.edit')
  const source: EditSource = { id: view.item.id, fileUrl: view.item.fileUrl as string, name: view.item.templateName, aspect: view.item.aspect, resolution: view.item.resolution }
  const [draft, setDraft] = useState<EditDraft>({ text: '', resolution: source.resolution, aspect: source.aspect })
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useJob(jobId)
  const locale = useLocale()
  const done = job?.status === 'succeeded' ? job.id : null

  useEffect(() => {
    if (!done) return
    let live = true
    // The new photo spent credits: views cached with the old balance are out of date.
    forgetWorkViews()
    void preloadWorkView(done, locale).then(() => live && onDone(done))
    return () => {
      live = false
    }
  }, [done, locale, onDone])

  const generate = (next: EditDraft) => {
    setDraft(next)
    setJobId(startEdit(source, next, view.edit.creditsCost, view.edit.concurrency, t('titleEdited', { name: source.name })))
  }
  if (job && (job.status === 'queued' || job.status === 'running' || job.status === 'succeeded')) {
    return <Stage><EditDeveloping job={job} source={source} /></Stage>
  }
  if (job?.status === 'failed') {
    return (
      <Stage>
        <EditFailure job={job} source={source} onRetry={() => setJobId(retryJob(job.id, view.edit.concurrency))} onChange={() => setJobId(null)} />
      </Stage>
    )
  }
  return <EditFormPane source={source} edit={view.edit} draft={draft} onDraft={(next) => setDraft((current) => ({ ...current, ...next }))} onGenerate={generate} onBack={onBack} />
}

// Developing and failed use the photo page's own two-column stage, scrolling inside the viewer.
function Stage({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(var(--sab)+24px)] md:pt-12 md:pb-6">{children}</div>
}

type FormProps = { source: EditSource; edit: Edit; draft: EditDraft; onDraft(next: Partial<EditDraft>): void; onGenerate(draft: EditDraft): void; onBack(): void }

function EditFormPane({ source, edit, draft, onDraft, onGenerate, onBack }: FormProps) {
  const t = useTranslations('app.edit')
  const { meta, form, bar } = useEditForm({ source, balance: edit.balance, creditsCost: edit.creditsCost, imageOptions: edit.imageOptions, draft, onDraft, onGenerate })
  return (
    <div className={VIEWER_GRID}>
      <div className="flex-none px-4 md:flex md:min-h-0 md:flex-col md:justify-center md:gap-4 md:overflow-y-auto md:bg-card md:p-6 md:shadow-[inset_-1px_0_0_var(--border)]">
        <EditPhoto src={source.fileUrl} className="h-[120px] md:mx-auto md:aspect-[4/5] md:h-auto md:max-h-[560px] md:w-full md:max-w-[448px]" />
        <p className="hidden text-center text-caption text-bone-dim md:block">{t('hint')}</p>
      </div>
      <section aria-labelledby="viewer-edit-h" className="flex flex-col px-4 pt-4 md:min-h-0 md:px-6 md:pt-3 md:pb-6">
        <BackToWork onBack={onBack} className="-ml-1 hidden self-start md:inline-flex" />
        <h2 id="viewer-edit-h" className="font-display text-h1 leading-[1.05] md:mt-2">{t('title')}</h2>
        <p className="mt-1 mb-5 text-caption text-muted-foreground">{meta}</p>
        <div className="md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain">{form}</div>
        <div className="sticky bottom-0 z-10 md:static">{bar}</div>
      </section>
    </div>
  )
}
