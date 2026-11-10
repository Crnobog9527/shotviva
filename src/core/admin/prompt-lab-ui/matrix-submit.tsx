import { useRef, useState } from 'react'
import { Button } from '@/core/ui/button'
import type { LabRun } from '../prompt-lab/types'
import { LabRequestError, labError, labRequest } from './api'
import { copy as c, usd } from './copy'

export type MatrixInput = { sessionId: string; photoIds: string[]; versionIds: string[]; providerId: string
  resolution: string; quality: string; useStyleReference: boolean }
type Quote = { count: number; estimateUsd: number }
type Cell = { id: string; status: LabRun['status'] }

// Cells are already reserved together. Individual requests claim one cell, so interrupted
// browser sessions can resume queued work from history without reserving or charging twice.
export async function executeCells(cells: Cell[], changed: () => Promise<void>) {
  const queued = cells.filter(cell => cell.status === 'queued')
  const failures: string[] = []
  async function worker() {
    for (let cell = queued.shift(); cell; cell = queued.shift()) {
      try { await labRequest('run', { runId: cell.id }) } catch (e) { failures.push(labError(e)) }
    }
  }
  // A cell can occupy its route for five minutes. Two waves fit the ten-minute claim window.
  await Promise.all(Array.from({ length: Math.min(queued.length, 6) }, worker))
  await changed()
  if (failures.length) throw new Error(failures[0])
}

export function MatrixSubmit({ input, disabled, changed, onBusy }: { input: MatrixInput; disabled: boolean; changed(): Promise<void>; onBusy(value: boolean): void }) {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const id = useRef<string | null>(null)
  async function estimate() {
    setBusy(true); onBusy(true); setError('')
    try { setQuote(await labRequest<Quote>('quote', input)) }
    catch (e) { setError(labError(e)) } finally { setBusy(false); onBusy(false) }
  }
  async function run() {
    if (!quote) return
    setBusy(true); onBusy(true); setError('')
    id.current ??= crypto.randomUUID()
    try {
      const result = await labRequest<{ cells: Cell[] }>('matrix', { ...input, batchId: id.current, expectedEstimateUsd: quote.estimateUsd })
      await changed()
      await executeCells(result.cells, changed)
      id.current = null; setQuote(null)
    } catch (e) {
      if (e instanceof LabRequestError && e.code === 'CONFLICT') setQuote(null)
      setError(labError(e))
    } finally { setBusy(false); onBusy(false) }
  }
  return <div className="grid gap-2">
    {quote && <p>{quote.count} {c.count} · {c.estimate} {usd(quote.estimateUsd)}</p>}
    <Button disabled={disabled || busy} onClick={quote ? run : estimate}>{quote ? c.submit : c.quote}</Button>
    {error && <p role="alert" className="text-destructive">{error}</p>}</div>
}
