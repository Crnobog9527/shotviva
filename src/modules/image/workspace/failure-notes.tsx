'use client'

import { useTranslations } from 'next-intl'

import type { JobFailure } from '../generation/job-model'
import { failureReason, specificReason } from './error-copy'

// The lines under a failure's title: that what the user gave is kept (when Retry can resend it),
// the reason when it is one they can act on (always, when Retry cannot help), and a refund
// that is on hold when `hold`.
export function FailureNotes({ failure, retry, kept, hold = false }: { failure: JobFailure; retry: boolean; kept: string; hold?: boolean }) {
  const errors = useTranslations('app.errors')
  const reason = retry ? specificReason(failure, errors) : failureReason(failure, errors)
  const lines = [retry ? kept : null, reason, hold && failure.refunded === false ? errors('onHold') : null].filter((line) => line !== null)
  return lines.map((line) => (
    <p key={line} className="text-caption leading-[1.4] text-muted-foreground">
      {line}
    </p>
  ))
}
