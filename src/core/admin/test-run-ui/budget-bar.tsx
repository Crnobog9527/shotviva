'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'

import type { TestBudget } from '../test-runs'
import { saveBudget } from './api'
import { TEST_RUN_COPY as COPY } from './copy'
import { failureMessage, usd } from './messages'

type Props = { budget: TestBudget | null; onSaved: () => void; onError: (message: string) => void }

// Today's spend against the daily cap (ARCHITECTURE §10.b 「费用」), editable in place. The server
// enforces the cap before each provider call; this only shows it.
export function BudgetBar({ budget, onSaved, onError }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const spent = budget?.spentUsd ?? 0
  const cap = budget?.budgetUsd ?? 0
  const ratio = cap > 0 ? Math.min(1, spent / cap) : 1
  const save = async () => {
    const value = Number(editing)
    if (!Number.isFinite(value) || value < 0 || value > 1000) return onError(COPY.budget.invalid)
    setSaving(true)
    try {
      await saveBudget(value)
      setEditing(null)
      onSaved()
    } catch (error) {
      onError(failureMessage(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="bg-muted/40 grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-medium">{COPY.budget.label}</span>
        <span className="font-mono text-sm tabular-nums">{budget ? COPY.budget.value(usd.format(spent), usd.format(cap)) : '…'}</span>
        {editing === null ? (
          <Button variant="link" size="xs" className="ml-auto px-0" onClick={() => setEditing(String(cap))} disabled={!budget}>
            {COPY.budget.edit}
          </Button>
        ) : null}
      </div>
      <div className="bg-border h-1.5 overflow-hidden rounded-full" role="presentation">
        <div className={ratio >= 1 ? 'bg-destructive h-full' : 'bg-primary h-full'} style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="text-muted-foreground text-xs">{COPY.budget.hint}</p>
      {editing !== null ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="test-budget">{COPY.budget.input}</Label>
            <Input id="test-budget" inputMode="decimal" className="w-28" value={editing} onChange={(event) => setEditing(event.target.value)} />
          </div>
          <Button size="sm" onClick={save} disabled={saving}>
            {COPY.budget.save}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
            {COPY.budget.cancel}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
