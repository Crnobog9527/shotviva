'use client'

import { useEffect, useState } from 'react'

import type { ImageCapabilities } from '@/core/templates/image-capabilities'

import type { ProviderAdminActions, ProviderActionResult } from '../providers/types'

type CatalogResult = ProviderActionResult<ImageCapabilities | null>
type Result = { baseUrl: string; model: string; result: CatalogResult }

// A lookup carries its model and endpoint. While a different lookup is pending its result
// must never enable Save or supply the new model's tiers.
export function useModelResolutions(active: boolean, baseUrl: string, model: string, lookup: ProviderAdminActions['lookupModel']) {
  const [last, setLast] = useState<Result | null>(null)
  const [attempt, setAttempt] = useState(0)
  const enabled = active && Boolean(baseUrl && model)
  useEffect(() => {
    if (!enabled) return
    let current = true
    const timer = setTimeout(async () => {
      const result = await lookup({ baseUrl, model, retry: attempt > 0 }).catch(() => ({ ok: false, reason: 'openrouter_catalog_unavailable' }) as const)
      if (current) setLast({ baseUrl, model, result })
    }, 350)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [enabled, baseUrl, model, lookup, attempt])

  const result = enabled && last?.model === model && last.baseUrl === baseUrl ? last.result : null
  const retry = () => {
    setLast(null)
    setAttempt((n) => n + 1)
  }
  return { pending: enabled && result === null, result, snapshot: result?.ok ? result.value : null, retry }
}
