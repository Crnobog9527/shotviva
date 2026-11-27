'use client'

import { useCallback, useEffect, useState } from 'react'

import type { CataloguePayload } from './catalogue-payload'
import { dropDeviceCatalogue, fetchNewerCatalogue, readDeviceCatalogue, writeDeviceCatalogue } from './catalogue-store'
import type { PublicCatalogue } from './public-catalogue'

// This tab's copy, so coming back to Create within the session draws the grid on the very first
// render, before IndexedDB answers.
const memory = new Map<string, PublicCatalogue>()
// The version is checked at most once a minute per language; the grid never waits for it.
const CHECK_EVERY_MS = 60_000
const checkedAt = new Map<string, number>()

type State = { payload: CataloguePayload | null; failed: boolean }

// One pass: what the device holds (shown at once), then a newer file from the edge, at most once a
// minute unless asked (a retry). A failure with nothing to show drops the record and reports it.
const due = (locale: string, force: boolean) => force || Date.now() - (checkedAt.get(locale) ?? 0) >= CHECK_EVERY_MS

// A newer file from the edge, written to the device; false when the check failed.
async function update(locale: string, held: PublicCatalogue | null, show: (file: PublicCatalogue) => void): Promise<boolean> {
  checkedAt.set(locale, Date.now())
  try {
    const newer = await fetchNewerCatalogue(locale, held?.version ?? null)
    if (newer) {
      show(newer)
      await writeDeviceCatalogue(newer)
    }
    return true
  } catch {
    return false
  }
}

async function refresh(locale: string, force: boolean, show: (file: PublicCatalogue) => void): Promise<'failed' | 'ok'> {
  const held = memory.get(locale) ?? (await readDeviceCatalogue(locale))
  if (held) show(held)
  if (held && !due(locale, force)) return 'ok'
  // Offline or a bad answer: keep what is shown; with nothing shown, drop the record and report it.
  if ((await update(locale, held, show)) || held) return 'ok'
  await dropDeviceCatalogue(locale)
  return 'failed'
}

// Create's grid from the device (stale-while-revalidate): the copy on the phone draws at once,
// then the version is checked in the background and a newer file swaps in quietly. With nothing
// on the device the file is fetched from the edge. `retry` after a failure with nothing to show.
export function useDeviceCatalogue(locale: string) {
  const [state, setState] = useState<State>(() => ({ payload: memory.get(locale)?.payload ?? null, failed: false }))
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    const show = (file: PublicCatalogue) => {
      memory.set(locale, file)
      if (live) setState({ payload: file.payload, failed: false })
    }
    void refresh(locale, attempt > 0, show).then((result) => {
      if (live && result === 'failed') setState({ payload: null, failed: true })
    })
    return () => {
      live = false
    }
  }, [locale, attempt])
  const retry = useCallback(() => {
    setState((current) => ({ ...current, failed: false }))
    setAttempt((count) => count + 1)
  }, [])
  return { ...state, retry }
}
