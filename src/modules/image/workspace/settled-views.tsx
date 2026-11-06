'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'

import { ActionBar } from '@/core/app-shell'
import { buttonVariants } from '@/core/ui/button'

import { CompareSlider } from '../catalogue/compare-slider'
import type { TrackedJob } from '../generation/job-model'
import { ResultPhoto } from '../result/result-photo'
import { ShareButton } from '../result/share-button'
import { canRetry, failureReason, refundLine } from './error-copy'

const ghost = buttonVariants({ variant: 'glass', size: 'touch', className: 'flex-1' })

// Success (DESIGN §4.4): the photo full width at its ratio, before/after, Share as the one
// primary, and a quiet way to make another.
export function SuccessView({ job, shareText, onAgain }: { job: TrackedJob; shareText: string; onAgain(): void }) {
  const t = useTranslations('app')
  const fileUrl = job.fileUrl as string
  return (
    <section aria-labelledby="done-h" className="px-4 pt-2">
      <h2 id="done-h" className="sr-only">{t('workspace.readyTitle')}</h2>
      <ResultPhoto src={fileUrl} alt={t('workspace.resultAlt', { name: job.templateName })} pool={job.creditPool} />
      {job.previewUrl ? (
        <div className="mt-6">
          <h3 className="mb-3 text-headline leading-[1.2] font-semibold tracking-[-0.01em]">{t('workspace.beforeAfter')}</h3>
          <CompareSlider before={job.previewUrl} after={fileUrl} afterGround="white" afterAlt={t('template.resultAlt', { name: job.templateName })} />
        </div>
      ) : null}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onAgain} className={ghost}>
          {t('workspace.makeAnother')}
        </button>
        <Link href="/photos" className={ghost}>
          {t('workspace.seeInPhotos')}
        </Link>
      </div>
      <ActionBar>
        <ShareButton fileUrl={fileUrl} name={`shotviva-${job.templateId}`} shareText={shareText} />
      </ActionBar>
    </section>
  )
}

// Failure (DESIGN §4.4): why, that the credits came back, Retry with the same photo, and a way
// to change the photo.
export function FailureView({ job, onRetry, onNewPhoto }: { job: TrackedJob; onRetry(): void; onNewPhoto(): void }) {
  const t = useTranslations('app')
  const errors = useTranslations('app.errors')
  const failure = job.failure ?? { code: 'INTERNAL', message: '', refunded: null }
  const retry = canRetry(failure) && job.inputKey !== null
  return (
    <section aria-labelledby="fail-h" className="px-4 pt-2">
      <div role="alert" className="hairline-lit rounded-panel bg-card p-4">
        <h2 id="fail-h" className="text-headline leading-[1.25] font-semibold">{t('workspace.failTitle')}</h2>
        <p className="mt-2 text-body text-bone-dim">{failureReason(failure, errors)}</p>
        <p className="mt-3 flex items-center gap-2 text-caption text-foreground">
          <span aria-hidden="true" className="size-2 rounded-full bg-success" />
          {refundLine(failure, errors)}
        </p>
      </div>
      {retry ? (
        <div className="mt-4 flex">
          <button type="button" onClick={onNewPhoto} className={ghost}>
            {t('workspace.useAnother')}
          </button>
        </div>
      ) : null}
      <ActionBar>
        <button type="button" onClick={retry ? onRetry : onNewPhoto} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          {t(retry ? 'workspace.retry' : 'workspace.useAnother')}
        </button>
      </ActionBar>
    </section>
  )
}
