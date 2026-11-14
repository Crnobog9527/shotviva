'use client'

import { useEffect, useSyncExternalStore } from 'react'

import type { Resolution } from '@/core/templates/output-options'

import type { Eta } from './eta'

// Usual durations by template and size, fetched once per page life when a wait screen first
// needs one (the server caches them for a quarter of an hour). `null`: asked, none to show.
const known = new Map<string, Eta | null>()
const asked = new Set<string>()
const listeners = new Set<() => void>()

const keyOf = (templateId: string, resolution: Resolution) => `${templateId}:${resolution}`

type EstimateBody = { estimate: { p50_s: number; p75_s: number } | null }

async function fetchEta(templateId: string, resolution: Resolution): Promise<Eta | null> {
  try {
    const response = await fetch(`/api/generate/estimate?${new URLSearchParams({ template: templateId, resolution })}`)
    if (!response.ok) return null
    const { estimate } = (await response.json()) as EstimateBody
    return estimate ? { p50Ms: estimate.p50_s * 1000, p75Ms: estimate.p75_s * 1000 } : null
  } catch {
    return null
  }
}

export function requestEta(templateId: string, resolution: Resolution) {
  const key = keyOf(templateId, resolution)
  if (asked.has(key)) return
  asked.add(key)
  void fetchEta(templateId, resolution).then((eta) => {
    known.set(key, eta)
    listeners.forEach((listener) => listener())
  })
}

export function getEta(templateId: string, resolution: Resolution): Eta | null {
  return known.get(keyOf(templateId, resolution)) ?? null
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// The usual duration of this job's template at its size; null until it arrives or when none.
export function useEta(job: { templateId: string; resolution: Resolution } | null | undefined): Eta | null {
  const templateId = job?.templateId ?? ''
  const resolution = job?.resolution ?? '1k'
  useEffect(() => {
    if (templateId) requestEta(templateId, resolution)
  }, [templateId, resolution])
  return useSyncExternalStore(subscribe, () => (templateId ? getEta(templateId, resolution) : null), () => null)
}
