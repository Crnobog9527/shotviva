'use client'

import { useTranslations } from 'next-intl'

import { ActionBar } from '@/core/app-shell'
import { Link } from '@/core/i18n/ui'
import { buttonVariants } from '@/core/ui/button'

import { CompareSlider } from '../catalogue/compare-slider'
import { editHref } from '../edit-ui/edit-link'
import type { TrackedJob } from '../generation/job-model'
import { SIDE_BY_SIDE } from '../result/action-styles'
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
// phone, Download from lg. With editing on, "Edit this photo" sits beside Make another (Owner
// 2026-11-08), as Edit does on the photo's page, and opens that page with the edit panel up.
type SuccessProps = { job: TrackedJob; shareText: string; editable: boolean; onAgain(): void }

export function SuccessView({ job, shareText, editable, onAgain }: SuccessProps) {
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
        <DoneActions jobId={job.id} editable={editable} onAgain={onAgain} />
      </ResultPanel>
    </StageLayout>
  )
}

type FailureProps = { job: TrackedJob; onRetry(): void; onNewPhoto(): void; onEditWords(): void }

// Failed (DESIGN §4.4, B comp workspace.html?state=failed): the message leads on a phone. What
// happened to the credits, that the photo and settings are kept (or the reason, when it is one
// the user can act on), Change photo, and Retry with its cost. The tray keeps the photo as a
// grey negative, "Not developed". Refused words (ARCHITECTURE §5.1a) go back to the form with
// the photo kept: it is the text that has to change, not the photo.
export function FailureView({ job, onRetry, onNewPhoto, onEditWords }: FailureProps) {
  const t = useTranslations('app')
  const errors = useTranslations('app.errors')
  const { failure, retry } = readFailure(job.failure, job.inputKey !== null)
  const words = failure.code === 'IDENTITY_SWAP_REFUSED'
  const size = t.rich('workspace.developingSize', { tier: tierName(job.resolution, t), px: tierPx(job.resolution), mono: monoTag })
  const tray = (
    <>
      <DevelopTray src={job.previewUrl ?? null} developing={false} negative hud={[t('workspace.failState.hud'), size]} className={TRAY_SIZE} />
      <TrayCaption>{failure.refunded === false ? refundLine(failure, errors) : t('workspace.failState.caption')}</TrayCaption>
    </>
  )
  const bar = (
    <ActionBar className="md:px-0">
      <button type="button" onClick={retry ? onRetry : words ? onEditWords : onNewPhoto} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
        {retry ? t.rich('workspace.retryCost', { count: job.credits, cost: costTag }) : t(words ? 'workspace.editWords' : 'workspace.useAnother')}
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

// Edit and Make another side by side, the photo page's quiet pair (action-styles.ts); without
// editing, Make another stays the quiet link it was.
function DoneActions({ jobId, editable, onAgain }: { jobId: string; editable: boolean; onAgain(): void }) {
  const t = useTranslations('app.workspace')
  const quiet = buttonVariants({ variant: 'glass', size: 'touch', className: SIDE_BY_SIDE })
  if (!editable) {
    return (
      <button type="button" onClick={onAgain} className="mt-1 inline-flex min-h-11 items-center gap-0.5 text-label font-medium text-foreground">
        {t('makeAnother')}
        <Chevron />
      </button>
    )
  }
  return (
    <div className="mt-2 grid w-full grid-cols-2 gap-2">
      <Link href={editHref(jobId)} className={quiet}>
        <Glyph d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
        {t('doneState.edit')}
      </Link>
      <button type="button" onClick={onAgain} className={quiet}>
        <Glyph d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
        {t('makeAnother')}
      </button>
    </div>
  )
}

// The 18px line icons of the photo page's Edit and Make again.
function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] flex-none text-primary" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}
