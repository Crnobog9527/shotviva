'use client'

import { useState, useSyncExternalStore } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/replay'
import { ENTERPRISE_LINK_LOCALE } from '@/core/i18n/locales'
import { localizePath } from '@/core/i18n/paths'
import { Button } from '@/core/ui/button'

import { ORGS_COPY as COPY } from '../orgs/copy'
import { Card } from './fields'

const subscribeNothing = () => () => undefined

// The org's staff-only join link on /admin/orgs/[id] (Owner 2026-11-23), built exactly like the
// owner's 员工专用链接 (StaffLinkPanel: /zh/join/org/<token> on the page's own origin) so the admin
// can send it to the customer. Read only: a new link is the owner's 重置 in their workspace. Kept
// out of session replay like the owner's copy.
export function StaffLinkCard({ token, suspended }: { token: string | null; suspended: boolean }) {
  const origin = useSyncExternalStore(subscribeNothing, () => window.location.origin, () => '')
  const [notice, setNotice] = useState<'copied' | 'failed' | null>(null)
  if (!token) {
    return (
      <Card title={COPY.staffLinkTitle}>
        <p className="text-sm text-muted-foreground">{COPY.staffLinkMissing}</p>
      </Card>
    )
  }
  const url = origin + localizePath(`/join/org/${token}`, ENTERPRISE_LINK_LOCALE)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setNotice('copied')
    } catch {
      setNotice('failed')
    }
  }
  return (
    <Card title={COPY.staffLinkTitle} hint={COPY.staffLinkHint}>
      <p className={`${REPLAY_BLOCK_CLASS} select-all font-mono text-sm break-all`}>{url}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={!origin} onClick={copy}>{COPY.staffLinkCopy}</Button>
        <span role="status" className="text-sm text-muted-foreground">
          {notice === 'copied' ? COPY.staffLinkCopied : notice === 'failed' ? COPY.staffLinkCopyFailed : null}
        </span>
      </div>
      {suspended ? <p role="status" className="text-sm text-destructive">{COPY.staffLinkSuspended}</p> : null}
      <p className="text-xs text-muted-foreground">{COPY.staffLinkReset}</p>
    </Card>
  )
}
