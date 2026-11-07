'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import type { TrackedJob } from '../generation/job-model'
import { DevelopSteps } from '../workspace/develop-steps'
import { DevelopTray, TrayCaption } from '../workspace/develop-tray'
import { SIDE_BY_SIDE } from '../result/action-styles'
import { readFailure, refundState } from '../workspace/error-copy'
import { FailureNotes } from '../workspace/failure-notes'
import { costTag, monoTag, ResultPanel } from '../workspace/result-panel'
import { sizeLabel, tierName, tierPx } from '../workspace/workspace-options'
import type { EditSource } from './edit-source'

// An edit develops over the photo it was made from, on the photo page's own layout (B comp
// photo.html): the print on the left and sticky from lg, the name and what is happening on the
// right. 4:5 like the page's print, never taller than the viewport.
const EDIT_TRAY = 'aspect-[4/5] md:mx-auto md:max-w-[520px] lg:w-[min(100%,calc((100dvh-240px)*0.8))] lg:max-w-none'

function EditStage({ labelledBy, tray, children }: { labelledBy: string; tray: ReactNode; children: ReactNode }) {
  return (
    <section
      aria-labelledby={labelledBy}
      className="px-4 pt-2 md:mx-auto md:max-w-[520px] md:px-0 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-x-12 lg:px-(--gutter) lg:pt-6"
    >
      <div className="lg:sticky lg:top-[132px]">{tray}</div>
      <div className="pt-4 lg:pt-0">{children}</div>
    </section>
  )
}

function EditHead({ id, name, meta }: { id: string; name: string; meta: ReactNode }) {
  return (
    <header>
      <h1 id={id} className="font-display text-title leading-none tracking-[-0.02em] lg:text-[40px]">{name}</h1>
      <p className="mt-1.5 text-caption text-muted-foreground">{meta}</p>
    </header>
  )
}

const useSize = (job: TrackedJob) => {
  const t = useTranslations('app')
  return t.rich('workspace.developingSize', { tier: tierName(job.resolution, t), px: tierPx(job.resolution), mono: monoTag })
}

// Developing (photo.html?state=generating): nothing uploads for an edit, so the steps are
// Request sent and Generating. Leaving is fine; the new photo lands in Photos.
export function EditDeveloping({ job, source }: { job: TrackedJob; source: EditSource }) {
  const t = useTranslations('app')
  const waiting = job.status === 'queued'
  const tray = (
    <>
      <DevelopTray src={source.fileUrl} developing={!waiting} hud={[t(waiting ? 'workspace.waiting' : 'workspace.developing'), useSize(job)]} className={EDIT_TRAY} />
      <TrayCaption>{t('edit.developingCaption')}</TrayCaption>
    </>
  )
  return (
    <EditStage labelledBy="edit-gen-h" tray={tray}>
      <EditHead id="edit-gen-h" name={source.name} meta={t('edit.metaDeveloping', { size: sizeLabel(job.aspect, t), tier: tierName(job.resolution, t), count: job.credits })} />
      <div className="mt-4">
        <DevelopSteps job={job} done={[t('edit.requestSent')]} />
      </div>
      <p className="mt-3 text-caption text-bone-dim">{t('edit.leave')}</p>
    </EditStage>
  )
}

// Failed (photo.html?state=failed): the original as a grey negative, "Not developed", the
// credits, that the request is kept, Retry with its cost and Change the request (which reopens
// the panel with the words). A request that would only fail again offers the change alone.
export function EditFailure({ job, source, onRetry, onChange }: { job: TrackedJob; source: EditSource; onRetry(): void; onChange(): void }) {
  const t = useTranslations('app')
  const { failure, retry } = readFailure(job.failure)
  const tray = (
    <>
      <DevelopTray src={source.fileUrl} developing={false} negative hud={[t('workspace.failState.hud'), useSize(job)]} className={EDIT_TRAY} />
      <TrayCaption>{t('edit.failUntouched')}</TrayCaption>
    </>
  )
  const meta = t('edit.metaFailed', { size: sizeLabel(job.aspect, t), tier: tierName(job.resolution, t), refund: refundState(failure), count: job.credits })
  return (
    <EditStage labelledBy="edit-fail-h" tray={tray}>
      <EditHead id="edit-fail-h" name={source.name} meta={meta} />
      <ResultPanel tone="fail" title={t(failure.refunded === true ? 'edit.failTitleRefunded' : 'edit.failTitle')} className="mt-4">
        <FailureNotes failure={failure} retry={retry} kept={t('edit.failKept')} hold />
      </ResultPanel>
      <FailureActions retry={retry} credits={job.credits} onRetry={onRetry} onChange={onChange} />
    </EditStage>
  )
}

// Retry with its cost as the one primary and Change the request quiet under it; when Retry
// cannot help, Change the request is the primary.
function FailureActions({ retry, credits, onRetry, onChange }: { retry: boolean; credits: number; onRetry(): void; onChange(): void }) {
  const t = useTranslations('app')
  const change = (
    <>
      <PenIcon className={retry ? 'text-primary' : undefined} />
      {t('edit.changeRequest')}
    </>
  )
  return (
    <div className="mt-4 grid gap-2">
      {retry ? (
        <>
          <button type="button" onClick={onRetry} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
            {t.rich('workspace.retryCost', { count: credits, cost: costTag })}
          </button>
          <button type="button" onClick={onChange} className={buttonVariants({ variant: 'glass', size: 'touch', className: SIDE_BY_SIDE })}>
            {change}
          </button>
        </>
      ) : (
        <button type="button" onClick={onChange} className={buttonVariants({ variant: 'cta', size: 'cta', className: 'gap-1.5' })}>
          {change}
        </button>
      )}
    </div>
  )
}

function PenIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-[18px]', className)} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
    </svg>
  )
}
