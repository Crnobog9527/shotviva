'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Link } from '@/core/i18n/ui'
import { Button } from '@/core/ui/button'

import type { JoinAction } from './actions'
import { Result } from './parts'
import { useConsoleAction } from './use-console-action'

// The confirm button of /join/org/[token]. Joining the same org twice is a no-op in the SQL, so a
// double click or a retry cannot seat anyone twice; after success the page shows where to go.
export function JoinForm({ join, orgName }: { join: JoinAction; orgName: string }) {
  const t = useTranslations('app.org.join')
  const [joined, setJoined] = useState(false)
  const { pending, outcome, run } = useConsoleAction()
  const submit = () => run(join, t('done', { org: orgName }), () => setJoined(true))
  if (joined) {
    return (
      <div className="space-y-3" role="status">
        <p className="text-body font-medium">{t('done', { org: orgName })}</p>
        <Link href="/account" className="inline-flex min-h-11 items-center text-label font-medium text-primary underline underline-offset-4">{t('toAccount')}</Link>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <Button type="button" variant="cta" size="cta" disabled={pending} onClick={submit}>
        {pending ? t('joining') : t('confirm', { org: orgName })}
      </Button>
      <Result outcome={outcome} />
    </div>
  )
}
