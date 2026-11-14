'use client'

import { useState } from 'react'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'

import type { WishlistSwitch, WishlistSwitchInput } from '../system-settings/types'
import type { ActionResult } from '../templates/types'
import { formatBeijing } from '../shell/format'
import { useAdminAction } from '../shell/use-admin-action'
import { SettingSwitchDialog } from './setting-switch-dialog'
import type { SwitchCopy } from './switch-copy'

export type SettingSwitchCardProps = {
  copy: SwitchCopy
  value: WishlistSwitch
  // An extra line under the state, e.g. the wishlist's preview override on this deployment.
  note?: string | null
  save: (input: WishlistSwitchInput) => Promise<ActionResult>
}

function lastChanged(COPY: SwitchCopy, value: WishlistSwitch): string {
  const at = formatBeijing(value.updatedAt)
  return at ? COPY.lastChanged(value.updatedByEmail ?? COPY.someone, at) : COPY.neverChanged
}

// One runtime on/off switch: 需求墙 (ARCHITECTURE §15.6, T62), the public gallery (§9, T108).
// The state shown is what the server last read; the save action refreshes the page, so it
// follows the stored row. Every change goes through a confirmation dialog.
export function SettingSwitchCard({ copy: COPY, value, note, save }: SettingSwitchCardProps) {
  const titleId = `${COPY.key}-switch-title`
  const [target, setTarget] = useState<boolean | null>(null)
  const { pending, error, notice, run } = useAdminAction()

  const confirm = (enabled: boolean) =>
    run(
      async () => {
        const result = await save({ enabled })
        return result.ok ? { ok: true as const, value: undefined } : result
      },
      () => {
        setTarget(null)
        return enabled ? COPY.saved.on : COPY.saved.off
      },
    )

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id={titleId} className="font-medium">
            {COPY.title}
          </h2>
          <p className="font-mono text-xs text-muted-foreground">{COPY.key}</p>
          <p className="text-sm text-muted-foreground">{COPY.body}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{COPY.stateLabel}</span>
          <Badge variant={value.enabled ? 'default' : 'secondary'}>{value.enabled ? COPY.state.on : COPY.state.off}</Badge>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{lastChanged(COPY, value)}</p>
      {note ? <p className="rounded-md bg-muted p-3 text-xs">{note}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant={value.enabled ? 'outline' : 'default'} disabled={pending} onClick={() => setTarget(!value.enabled)}>
          {value.enabled ? COPY.turnOff : COPY.turnOn}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? (
          <p className="text-sm text-muted-foreground" role="status">
            {notice}
          </p>
        ) : null}
      </div>
      <SettingSwitchDialog copy={COPY} target={target} pending={pending} onCancel={() => setTarget(null)} onConfirm={confirm} />
    </section>
  )
}
