'use client'

import { useTranslations } from 'next-intl'

import { ActionBar } from '@/core/app-shell'
import { buttonVariants } from '@/core/ui/button'

import { CompareSlider } from '../catalogue/compare-slider'
import type { TrackedJob } from '../generation/job-model'
import { ResultPhoto } from '../result/result-photo'
import { ShareButton } from '../result/share-button'
import { DevelopTray, StageLayout, TRAY_SIZE, TrayCaption } from './develop-tray'
import { readFailure, refundLine } from './error-copy'
import { FailureNotes } from './failure-notes'
import { costTag, monoTag, ResultPanel } from './result-panel'
import { tierName, tierPx } from './workspace-options'

// Done (DESIGN §4.4, B comp workspace.html?state=done): the page's two columns stay. The result
// on the tray with "Done", "Saved to Photos" with the size, the credits and what the pool means,
// a quiet Make another, then before/after (DESIGN §4.4 keeps it). Share is the one primary on a
// phone, Download from lg.
export function SuccessView({ job, shareText, onAgain }: { job: TrackedJob; shareText: string; onAgain(): void }) {
  const t = useTranslations('app')
  const fileUrl = job.fileUrl as string
  const px = tierPx(job.resolution)
  const size = t.rich('workspace.developingSize', { tier: tierName(job.resolution, t), px, mono: monoTag })
  const tray = (
    <>
      <ResultPhoto src={fileUrl} alt={t('workspace.resultAlt', { name: job.templateName })} pool={job.creditPool} hud={[t('workspace.doneState.hud'), size]} fit />
      <TrayCaption>{t('workspace.doneState.caption', { name: job.templateName })}</TrayCaption>
    </>
  )
  const after = job.previewUrl ? (
    <div className="mt-6">
      <h3 className="mb-3 text-headline leading-[1.2] font-semibold tracking-[-0.01em]">{t('workspace.beforeAfter')}</h3>
      <CompareSlider before={job.previewUrl} after={fileUrl} afterGround="white" afterAlt={t('template.resultAlt', { name: job.templateName })} />
    </div>
  ) : null
  const bar = (
    <ActionBar className="md:px-0">
      <ShareButton fileUrl={fileUrl} name={`shotviva-${job.templateId}`} shareText={shareText} px={px} />
    </ActionBar>
  )
  return (
    <StageLayout labelledBy="done-h" tray={tray} bar={bar} after={after}>
      <h2 id="done-h" className="sr-only">{t('workspace.readyTitle')}</h2>
      <ResultPanel tone="done" title={t('workspace.doneState.saved')}>
        <p className="text-caption leading-[1.4] text-muted-foreground">
          {t.rich('workspace.doneState.line', { tier: tierName(job.resolution, t), px, count: job.credits, pool: job.creditPool ?? 'none', mono: monoTag })}
        </p>
        <button type="button" onClick={onAgain} className="mt-1 inline-flex min-h-11 items-center gap-0.5 text-label font-medium text-foreground">
          {t('workspace.makeAnother')}
          <Chevron />
        </button>
      </ResultPanel>
    </StageLayout>
  )
}

// Failed (DESIGN §4.4, B comp workspace.html?state=failed): the message leads on a phone. What
// happened to the credits, that the photo and settings are kept (or the reason, when it is one
// the user can act on), Change photo, and Retry with its cost. The tray keeps the photo as a
// grey negative, "Not developed".
export function FailureView({ job, onRetry, onNewPhoto }: { job: TrackedJob; onRetry(): void; onNewPhoto(): void }) {
  const t = useTranslations('app')
  const errors = useTranslations('app.errors')
  const { failure, retry } = readFailure(job.failure, job.inputKey !== null)
  const size = t.rich('workspace.developingSize', { tier: tierName(job.resolution, t), px: tierPx(job.resolution), mono: monoTag })
  const tray = (
    <>
      <DevelopTray src={job.previewUrl ?? null} developing={false} negative hud={[t('workspace.failState.hud'), size]} className={TRAY_SIZE} />
      <TrayCaption>{failure.refunded === false ? refundLine(failure, errors) : t('workspace.failState.caption')}</TrayCaption>
    </>
  )
  const bar = (
    <ActionBar className="md:px-0">
      <button type="button" onClick={retry ? onRetry : onNewPhoto} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
        {retry ? t.rich('workspace.retryCost', { count: job.credits, cost: costTag }) : t('workspace.useAnother')}
      </button>
    </ActionBar>
  )
  return (
    <StageLayout labelledBy="fail-h" tray={tray} bar={bar} messageFirst>
      <h2 id="fail-h" className="sr-only">{t('workspace.failTitle')}</h2>
      <ResultPanel tone="fail" title={t(failure.refunded === true ? 'workspace.failState.titleRefunded' : 'workspace.failState.title')}>
        <FailureNotes failure={failure} retry={retry} kept={t('workspace.failState.kept')} />
        {retry ? (
          <button type="button" onClick={onNewPhoto} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'mt-2 rounded-full' })}>
            {t('workspace.failState.changePhoto')}
          </button>
        ) : null}
      </ResultPanel>
    </StageLayout>
  )
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}
