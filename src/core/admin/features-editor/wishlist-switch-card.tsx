'use client'

import { useState } from 'react'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'

import type { WishlistSwitch, WishlistSwitchInput } from '../system-settings/types'
import type { ActionResult } from '../templates/types'
import { formatBeijing } from '../shell/format'
import { useAdminAction } from '../shell/use-admin-action'
import { WISHLIST_SWITCH_COPY as COPY } from './wishlist-copy'
import { WishlistSwitchDialog } from './wishlist-switch-dialog'

export type WishlistSwitchCardProps = {
  value: WishlistSwitch
  // FEATURE_WISHLIST_PREVIEW=on on this (non-production) deployment.
  previewOverride: boolean
  save: (input: WishlistSwitchInput) => Promise<ActionResult>
}

function lastChanged(value: WishlistSwitch): string {
  const at = formatBeijing(value.updatedAt)
  return at ? COPY.lastChanged(value.updatedByEmail ?? COPY.someone, at) : COPY.neverChanged
}

// The runtime 需求墙 switch (ARCHITECTURE §15.6, T62). The state shown is what the server last
// read; the save action refreshes the page, so it follows the stored row.
export function WishlistSwitchCard({ value, previewOverride, save }: WishlistSwitchCardProps) {
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
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4" aria-labelledby="wishlist-switch-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="wishlist-switch-title" className="font-medium">
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
      <p className="text-xs text-muted-foreground">{lastChanged(value)}</p>
      {previewOverride ? <p className="rounded-md bg-muted p-3 text-xs">{COPY.previewOverride}</p> : null}
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
      <WishlistSwitchDialog target={target} pending={pending} onCancel={() => setTarget(null)} onConfirm={confirm} />
    </section>
  )
}
