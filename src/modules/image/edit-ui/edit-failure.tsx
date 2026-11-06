'use client'

import { useTranslations } from 'next-intl'

import { ActionBar } from '@/core/app-shell'
import { buttonVariants } from '@/core/ui/button'

import type { TrackedJob } from '../generation/job-model'
import { canRetry, failureReason, refundLine } from '../workspace/error-copy'

const ghost = buttonVariants({ variant: 'glass', size: 'touch', className: 'flex-1' })

// A failed edit (T6 comp, state=failed): the credits came back, the original is untouched,
// Retry sends the same request again, "Change the request" reopens the panel with the words.
export function EditFailure({ job, onRetry, onChange }: { job: TrackedJob; onRetry(): void; onChange(): void }) {
  const t = useTranslations('app')
  const errors = useTranslations('app.errors')
  const failure = job.failure ?? { code: 'INTERNAL', message: '', refunded: null }
  const retry = canRetry(failure)
  return (
    <section aria-labelledby="edit-fail-h" className="px-4 pt-2">
      <div role="alert" className="hairline-lit rounded-panel bg-card p-4">
        <h2 id="edit-fail-h" className="text-headline leading-[1.25] font-semibold">{t('edit.failTitle')}</h2>
        <p className="mt-2 text-body text-bone-dim">{failureReason(failure, errors)}</p>
        <p className="mt-3 flex items-center gap-2 text-caption text-foreground">
          <span aria-hidden="true" className="size-2 rounded-full bg-success" />
          {refundLine(failure, errors)} {t('edit.failUntouched')}
        </p>
      </div>
      {retry ? (
        <div className="mt-4 flex">
          <button type="button" onClick={onChange} className={ghost}>
            {t('edit.changeRequest')}
          </button>
        </div>
      ) : null}
      <ActionBar>
        <button type="button" onClick={retry ? onRetry : onChange} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          {t(retry ? 'workspace.retry' : 'edit.changeRequest')}
        </button>
      </ActionBar>
    </section>
  )
}
