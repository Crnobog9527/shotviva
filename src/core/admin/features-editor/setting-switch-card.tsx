'use client'

import { useState } from 'react'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import type { WishlistSwitch, WishlistSwitchInput } from '../system-settings/types'
import type { ActionResult } from '../templates/types'
import { formatBeijing } from '../shell/format'
import { useAdminAction } from '../shell/use-admin-action'
import { SettingSwitchDialog } from './setting-switch-dialog'
import { SWITCH_CARD_COPY, type SwitchCopy, type SwitchSummary } from './switch-copy'

// A switch that only works while another one is on. `met` is that other switch's stored state.
export type SwitchDependency = { label: string; met: boolean; unmet: string }

export type SettingSwitchCardProps = {
  copy: SwitchCopy
  value: WishlistSwitch
  // An extra line under the state, e.g. the wishlist's preview override on this deployment.
  note?: string | null
  dependency?: SwitchDependency
  save: (input: WishlistSwitchInput) => Promise<ActionResult>
}

function lastChanged(COPY: SwitchCopy, value: WishlistSwitch): string {
  const at = formatBeijing(value.updatedAt)
  return at ? COPY.lastChanged(value.updatedByEmail ?? COPY.someone, at) : COPY.neverChanged
}

// One runtime on/off switch (需求墙 T62, the public gallery T108, …). The state shown is what the
// server last read; the save action refreshes the page, so it follows the stored row. Every change
// goes through a confirmation dialog.
export function SettingSwitchCard({ copy: COPY, value, note, dependency, save }: SettingSwitchCardProps) {
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
    <section id={COPY.key} className="grid scroll-mt-20 gap-4 rounded-lg border border-border bg-card p-4" aria-labelledby={titleId}>
      <Header copy={COPY} enabled={value.enabled} titleId={titleId} />
      {COPY.summary ? <OnOff summary={COPY.summary} enabled={value.enabled} /> : null}
      {dependency ? <Dependency dependency={dependency} /> : null}
      {note ? <p className="rounded-md bg-muted p-3 text-xs">{note}</p> : null}
      <p className="text-xs text-muted-foreground">{lastChanged(COPY, value)}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant={value.enabled ? 'outline' : 'default'} disabled={pending} onClick={() => setTarget(!value.enabled)}>
          {value.enabled ? COPY.turnOff : COPY.turnOn}
        </Button>
        <Status error={error} notice={notice} />
      </div>
      {COPY.summary ? <Details copy={COPY} /> : null}
      <SettingSwitchDialog copy={COPY} target={target} pending={pending} onCancel={() => setTarget(null)} onConfirm={confirm} />
    </section>
  )
}

function Header({ copy: COPY, enabled, titleId }: { copy: SwitchCopy; enabled: boolean; titleId: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid min-w-0 flex-1 basis-64 gap-1">
        <h2 id={titleId} className="font-medium">
          {COPY.title}
        </h2>
        {COPY.summary ? (
          <p className="text-sm text-muted-foreground">{COPY.summary.purpose}</p>
        ) : (
          <>
            <p className="font-mono text-xs text-muted-foreground">{COPY.key}</p>
            <p className="text-sm text-muted-foreground">{COPY.body}</p>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {COPY.summary?.emergency ? <Badge variant="outline">{SWITCH_CARD_COPY.emergency}</Badge> : null}
        <span className="text-muted-foreground">{COPY.stateLabel}</span>
        <Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? COPY.state.on : COPY.state.off}</Badge>
      </div>
    </div>
  )
}

function Status({ error, notice }: { error: string | null | undefined; notice: string | null | undefined }) {
  if (error) return <p className="text-sm text-destructive">{error}</p>
  return notice ? (
    <p className="text-sm text-muted-foreground" role="status">
      {notice}
    </p>
  ) : null
}

// What on and off do, the current one marked.
function OnOff({ summary, enabled }: { summary: SwitchSummary; enabled: boolean }) {
  const rows = [
    { label: SWITCH_CARD_COPY.whenOn, text: summary.whenOn, current: enabled },
    { label: SWITCH_CARD_COPY.whenOff, text: summary.whenOff, current: !enabled },
  ]
  return (
    <dl className="grid gap-1 text-sm">
      {rows.map((row) => (
        <div key={row.label} className={cn('grid grid-cols-[3rem_1fr] gap-2', !row.current && 'text-muted-foreground')}>
          <dt className={cn(row.current && 'font-medium')}>{row.label}</dt>
          <dd>{row.text}</dd>
        </div>
      ))}
    </dl>
  )
}

function Dependency({ dependency }: { dependency: SwitchDependency }) {
  return dependency.met ? (
    <p className="text-sm text-muted-foreground">{dependency.label}</p>
  ) : (
    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="note">
      {dependency.unmet}
    </p>
  )
}

function Details({ copy }: { copy: SwitchCopy }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">{SWITCH_CARD_COPY.details}</summary>
      <div className="mt-2 grid gap-2 text-muted-foreground">
        <p>{copy.body}</p>
        <p className="text-xs">
          {SWITCH_CARD_COPY.settingKey} <span className="font-mono">{copy.key}</span>
        </p>
      </div>
    </details>
  )
}
