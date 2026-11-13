'use client'

import { useId, useState } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import type { ActionResult } from '../templates/types'
import { useAdminAction } from '../shell/use-admin-action'
import type { FeatureInviteInput, FeatureSetting } from '../features/types'
import { FEATURES_COPY as COPY } from './copy'

type Props = { setting: FeatureSetting; invite: (input: FeatureInviteInput) => Promise<ActionResult> }

// An invite-only feature: who has been invited, add one by email or phone, remove one. Each
// change saves at once; the list comes back from the server after refresh().
export function InviteCard({ setting, invite }: Props) {
  const [account, setAccount] = useState('')
  const { pending, error, notice, run } = useAdminAction()
  const inputId = useId()

  const send = (target: string, invited: boolean) =>
    run(async () => {
      const result = await invite({ key: setting.key, account: target, invited })
      return result.ok ? { ok: true as const, value: undefined } : result
    }, () => {
      if (invited) setAccount('')
      return invited ? COPY.invites.added : COPY.invites.removed
    })

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-medium">{setting.name}</h2>
        <p className="font-mono text-xs text-muted-foreground">{setting.key}</p>
        <p className="mt-2 text-sm text-muted-foreground">{COPY.invites.intro}</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => { event.preventDefault(); if (account.trim()) send(account.trim(), true) }}
      >
        <div className="grid gap-1 text-sm">
          <label htmlFor={inputId} className="font-medium">{COPY.invites.account}</label>
          <Input id={inputId} className="w-72 max-w-full" value={account} placeholder={COPY.invites.placeholder}
            onChange={(event) => setAccount(event.target.value)} />
        </div>
        <Button type="submit" disabled={pending || !account.trim()}>{COPY.invites.add}</Button>
      </form>
      <InviteList setting={setting} pending={pending} onRemove={(target) => send(target, false)} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </section>
  )
}

function InviteList({ setting, pending, onRemove }: { setting: FeatureSetting; pending: boolean; onRemove: (account: string) => void }) {
  if (setting.invites.length === 0) return <p className="text-sm text-muted-foreground">{COPY.invites.none}</p>
  return (
    <ul className="grid gap-1 text-sm">
      {setting.invites.map((item) => (
        <li key={item.userId} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3">
          <span className="truncate">{item.account}</span>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => onRemove(item.userId)}>
            {COPY.invites.remove}
          </Button>
        </li>
      ))}
    </ul>
  )
}
