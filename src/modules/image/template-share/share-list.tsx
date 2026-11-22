'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'


import { ShareLinkActions } from './share-link-actions'

export type ShareRow = { id: string; url: string; title: string | null; count: number; createdAt: string; revoked: boolean }

// "My template share links" (ARCHITECTURE §5.1g): each link newest first, to send again or to
// revoke. A revoked link stays listed, marked, so the creator knows why the client sees nothing.
export function ShareList({ rows }: { rows: readonly ShareRow[] }) {
  const t = useTranslations('app.templateShare')
  if (rows.length === 0) return <p className="rounded-panel bg-card p-4 text-body text-muted-foreground hairline">{t('listEmpty')}</p>
  return (
    <ul className="grid gap-3">
      {rows.map((row) => <ShareItem key={row.id} row={row} />)}
    </ul>
  )
}

function ShareItem({ row }: { row: ShareRow }) {
  const t = useTranslations('app.templateShare')
  const format = useFormatter()
  const title = row.title ?? t('defaultTitle')
  return (
    <li className="grid gap-3 rounded-panel bg-card p-4 hairline">
      <div className="grid gap-1">
        <p className="text-body leading-[1.25] font-semibold tracking-[-0.015em]">{title}</p>
        <p className="text-caption text-muted-foreground">
          {format.dateTime(new Date(row.createdAt), { dateStyle: 'medium' })} · <span className="font-mono">{t('itemCount', { count: row.count })}</span>
          {row.revoked ? <> · {t('revoked')}</> : null}
        </p>
      </div>
      {row.revoked ? null : (
        <>
          <ShareLinkActions url={row.url} title={title} primary={false} />
          <RevokeButton id={row.id} />
        </>
      )}
    </li>
  )
}

// Asks once, then DELETE /api/template-shares/<id> and a refresh of the list.
function RevokeButton({ id }: { id: string }) {
  const t = useTranslations('app.templateShare')
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'sending' | 'failed'>('idle')
  const revoke = async () => {
    if (!window.confirm(t('revokeConfirm'))) return
    setState('sending')
    const response = await fetch(`/api/template-shares/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!response?.ok) return setState('failed')
    router.refresh()
  }
  return (
    <div className="flex items-center justify-between gap-3">
      {state === 'failed' ? <p role="alert" className="text-caption text-destructive">{t('revokeFailed')}</p> : <span />}
      <button type="button" disabled={state === 'sending'} onClick={() => void revoke()}
        className="press inline-flex min-h-11 items-center rounded-full px-3 text-caption font-medium text-muted-foreground underline underline-offset-4 disabled:cursor-default">
        {t('revoke')}
      </button>
    </div>
  )
}
