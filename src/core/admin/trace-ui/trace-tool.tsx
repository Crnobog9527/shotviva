'use client'

import { useState } from 'react'

import type { ActionValue } from '@/core/admin/templates/types'
import { Button } from '@/core/ui/button'

import type { TraceResult } from '../trace/types'
import { TRACE_COPY as copy } from './copy'
import { TraceResultView } from './trace-result'

export type TraceActions = {
  stage(input: { contentType: string; size: number }): Promise<ActionValue<{ uploadId: string; putUrl: string; headers: Record<string, string> }>>
  read(input: { uploadId: string }): Promise<ActionValue<TraceResult>>
}

type State = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; result: TraceResult } | { kind: 'error'; message: string }

// The picture goes straight to the bucket (§8.1, never through a function body), then the server
// reads it.
async function upload(actions: TraceActions, file: File): Promise<ActionValue<TraceResult>> {
  const staged = await actions.stage({ contentType: file.type, size: file.size })
  if (!staged.ok) return staged
  const put = await fetch(staged.value.putUrl, { method: 'PUT', headers: staged.value.headers, body: file })
  if (!put.ok) return { ok: false, code: 'INTERNAL', message: copy.uploadFailed }
  return actions.read({ uploadId: staged.value.uploadId })
}

export function TraceTool({ actions }: { actions: TraceActions }) {
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const run = async () => {
    if (!file) return
    setState({ kind: 'running' })
    const answer = await upload(actions, file).catch(() => ({ ok: false as const, code: 'INTERNAL' as const, message: copy.uploadFailed }))
    setState(answer.ok ? { kind: 'done', result: answer.value } : { kind: 'error', message: answer.message })
  }
  return (
    <div className="grid max-w-3xl gap-4">
      <p className="text-sm">{copy.intro}</p>
      <p className="text-sm text-muted-foreground">{copy.limits}</p>
      <label className="grid gap-1 text-sm">
        {copy.pick}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      <Button className="justify-self-start" disabled={!file || state.kind === 'running'} onClick={() => void run()}>
        {state.kind === 'running' ? copy.running : copy.run}
      </Button>
      {state.kind === 'error' ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
      {state.kind === 'done' ? <TraceResultView result={state.result} /> : null}
    </div>
  )
}
