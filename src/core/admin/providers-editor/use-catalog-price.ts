'use client'

import { useEffect, useState } from 'react'

import type { CatalogPrice } from '@/core/jobs/catalog-price'
import { catalogModelFor, currentCatalogPrice } from '@/core/providers/catalog-model'
import type { ProviderAdapterId } from '@/core/providers/types'

import type { AdminProvider, ProviderActionResult, ProviderAdminActions } from '../providers/types'

type Key = { adapter: ProviderAdapterId; baseUrl: string; model: string }
type Result = Key & { result: ProviderActionResult<CatalogPrice | null> }

const same = (a: Key, b: Key) => a.adapter === b.adapter && a.baseUrl === b.baseUrl && a.model === b.model

type Lookup = ProviderAdminActions['lookupPrice']

// Runs the lookup for `key` (debounced) and keeps the last answer with the key it was for.
function useLookup(key: Key, enabled: boolean, lookup: Lookup) {
  const [last, setLast] = useState<Result | null>(null)
  const [attempt, setAttempt] = useState(0)
  const { adapter, baseUrl, model } = key
  useEffect(() => {
    if (!enabled) return
    let current = true
    const timer = setTimeout(async () => {
      const result = await lookup({ adapter, baseUrl, model, retry: attempt > 0 })
        .catch(() => ({ ok: false, reason: 'openrouter_catalog_unavailable' }) as const)
      if (current) setLast({ adapter, baseUrl, model, result })
    }, 350)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [enabled, adapter, baseUrl, model, lookup, attempt])
  const retry = () => {
    setLast(null)
    setAttempt((n) => n + 1)
  }
  return { result: enabled && last && same(last, key) ? last.result : null, retry }
}

// The live catalogue price for the model being edited (§10.0). While the lookup runs, a row's
// stored snapshot for the same model is shown; it never stands in for another model. `lookedUp`:
// whether the price shown is settled (a line with no catalogue is settled at once).
export function useCatalogPrice(key: Key, saved: AdminProvider | null, lookup: Lookup) {
  const enabled = Boolean(catalogModelFor(key.adapter, key.baseUrl, key.model))
  const { result, retry } = useLookup(key, enabled, lookup)
  const stored = saved ? currentCatalogPrice({ ...saved, ...key }) : null
  const settled = result !== null || stored !== null
  return {
    price: result?.ok ? result.value : stored,
    pending: enabled && !settled,
    failed: result !== null && !result.ok,
    lookedUp: !enabled || settled,
    retry,
  }
}
