'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'

import { useAdminAction } from '../shell/use-admin-action'
import type { ActionResult } from '../templates/types'
import { COSTS_COPY } from './copy'
import type { CostSettingsInput } from './types'

const COPY = COSTS_COPY.key

export type CostKeyActions = {
  save: (input: CostSettingsInput) => Promise<ActionResult>
  clear: () => Promise<ActionResult>
}

type Props = { keyLast4: string | null; projectId: string | null; actions: CostKeyActions }

const asValue = (result: ActionResult) => (result.ok ? { ok: true as const, value: undefined } : result)

// The Admin key entry (T33). The key field always starts blank and is a new-password input:
// the browser never has the stored key, only its last four characters.
export function KeyPanel({ keyLast4, projectId, actions }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [project, setProject] = useState(projectId ?? '')
  const { pending, error, notice, run } = useAdminAction()
  const save = () =>
    run(
      async () => asValue(await actions.save({ apiKey, projectId: project })),
      () => {
        setApiKey('')
        return COPY.saved
      },
    )
  const clear = () => run(async () => asValue(await actions.clear()), () => COPY.cleared)
  return (
    <section className="grid gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-semibold">{COPY.title}</h2>
        <span className="font-mono text-xs text-muted-foreground">{COPY.current(keyLast4)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{COPY.body}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="costs-api-key">{COPY.apiKey}</Label>
          <Input id="costs-api-key" type="password" autoComplete="new-password" className="font-mono" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <p className="text-xs text-muted-foreground">{COPY.apiKeyHint(keyLast4 !== null)}</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="costs-project">{COPY.projectId}</Label>
          <Input id="costs-project" className="font-mono" value={project} onChange={(e) => setProject(e.target.value)} />
          <p className="text-xs text-muted-foreground">{COPY.projectIdHint}</p>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-success">{notice}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || (keyLast4 === null && apiKey.trim() === '')} onClick={save}>
          {COPY.save}
        </Button>
        {keyLast4 ? (
          <Button variant="outline" disabled={pending} onClick={clear}>
            {COPY.clear}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
