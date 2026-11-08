'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/core/ui/button'
import { CopyText } from '@/core/ui/copy-text'
import { Textarea } from '@/core/ui/textarea'

import { toRecording } from '../identity-dry-run/recording'
import type { DryRunResult } from '../identity-dry-run/types'
import { DRY_RUN_COPY as COPY } from './copy'
import { DryRunTable } from './results-table'
import { summarize } from './summary'

type Done = Extract<DryRunResult, { ok: true }>

function Summary({ result }: { result: Done }) {
  const s = summarize(result.rows, result.prices)
  const parts = [
    COPY.summary(result.rows.length, s.refused, s.p50, s.p95),
    COPY.tokens(s.inputTokens, s.outputTokens),
    s.costUsd === null ? null : COPY.cost(s.costUsd.toFixed(6)),
    result.model ? COPY.model(result.model, result.promptVersion) : COPY.noProvider,
  ].filter(Boolean)
  return <p className="text-sm text-muted-foreground">{parts.join(' · ')}</p>
}

function Results({ result }: { result: Done }) {
  return (
    <>
      <Summary result={result} />
      <div className="overflow-x-auto">
        <DryRunTable rows={result.rows} />
      </div>
      <CopyText value={JSON.stringify(toRecording(result), null, 2)} label={COPY.json} copied={COPY.copied} className="justify-self-start text-sm">
        {COPY.json}
      </CopyText>
    </>
  )
}

// The face-swap dry run (ARCHITECTURE §5.1a, T81): lines in, the model's verdicts with latency
// and tokens out, plus the JSON that examples.recorded.json takes. `run` is the server
// action, which re-checks the admin role.
export function IdentityDryRun({ run }: { run: (input: { text: string }) => Promise<DryRunResult> }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<DryRunResult | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()
  const submit = () =>
    start(async () => {
      setFailed(false)
      try {
        setResult(await run({ text }))
      } catch {
        setFailed(true)
      }
    })
  const error = failed ? COPY.errors.failed : result && !result.ok ? COPY.errors[result.reason] : null
  return (
    <section className="mt-10 grid gap-3" aria-labelledby="identity-dry-run">
      <h2 id="identity-dry-run" className="text-lg font-semibold">
        {COPY.title}
      </h2>
      <p className="text-sm text-muted-foreground">{COPY.intro}</p>
      <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={COPY.placeholder} rows={8} />
      <div className="flex items-center gap-3">
        <Button type="button" onClick={submit} disabled={pending || text.trim().length === 0}>
          {pending ? COPY.running : COPY.run}
        </Button>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
      {result?.ok ? <Results result={result} /> : null}
    </section>
  )
}
