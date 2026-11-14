'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { nextCapabilitySync } from '@/core/providers/capability-expiry'
import type { ProviderActionResult } from '../providers/types'
import type { ImageProviderOption } from '.'
import { copy } from './copy'

type Sync = (id: string, retry: boolean) => Promise<ProviderActionResult>
const Context = createContext<Sync | null>(null)
export function ModelSyncProvider({ action, children }: { action: Sync; children: ReactNode }) {
  return <Context.Provider value={action}>{children}</Context.Provider>
}

// Both the editor and trial panel can select the same provider. Share the request and briefly
// retain a failed outcome across switches; explicit retry never starts a second in-flight request.
const attempts = new Map<string, { promise: ReturnType<Sync>; until: number }>()
function request(action: Sync, id: string, key: string, retry: boolean) {
  const last = attempts.get(key)
  if (last && (last.until === Infinity || (!retry && last.until > Date.now()))) return last.promise
  const entry = { until: Infinity, promise: action(id, retry).catch(() => ({ ok: false, reason: 'internal' } as const)) }
  attempts.set(key, entry)
  void entry.promise.finally(() => {
    entry.until = Date.now() + 60_000
    setTimeout(() => { if (attempts.get(key) === entry) attempts.delete(key) }, 60_000)
  })
  return entry.promise
}

export function ModelSyncStatus({ provider }: { provider: ImageProviderOption }) {
  const action = useContext(Context)
  const [attempt, retry] = useState(0)
  const [state, setState] = useState<'pending' | 'missing' | 'failed' | null>(null)
  const due = nextCapabilitySync(provider.openAI || Boolean(provider.fixedCapabilities), provider.capabilities)
  const id = provider.id
  const key = JSON.stringify([id, provider.model, provider.capabilities?.fetchedAt])
  useEffect(() => {
    if (!action || !Number.isFinite(due)) return
    let alive = true
    const timer = setTimeout(async () => {
      setState('pending')
      const result = await request(action, id, key, attempt > 0)
      if (alive) setState(result.ok ? null : result.reason === 'openrouter_model_missing' ? 'missing' : 'failed')
    }, attempt > 0 ? 0 : Math.max(0, due - Date.now()))
    return () => { alive = false; clearTimeout(timer) }
  }, [action, attempt, due, key, id])
  const status = state ?? (provider.capabilities?.catalogPricing?.status === 'unavailable' ? 'quoteFailed' : null)
  if (!status) return null
  return <p role="status" className="text-muted-foreground text-xs">{copy[status]}{' '}
    {status !== 'pending' && <button type="button" className="underline" onClick={() => retry(n => n + 1)}>{copy.retry}</button>}
  </p>
}
