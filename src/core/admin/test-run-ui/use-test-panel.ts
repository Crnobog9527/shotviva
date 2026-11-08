'use client'

import { useCallback, useEffect, useState } from 'react'

import type { TestPanelData, TestRunView } from '../test-runs'
import { loadPanel } from './api'
import { failureMessage } from './messages'
import { mergeRuns, placeholderRun, type Placeholder } from './placeholder'

export type Launch = { placeholder: Placeholder; start: () => Promise<TestRunView> }

// The panel's state (ARCHITECTURE §10.b): the server's data, loaded once with the 30-day cleanup
// when the panel opens; runs still in flight; and the last failure or notice. A launch shows its
// placeholders at once, runs every request together, then reloads (budget, photo URLs).
export function useTestPanel(templateId: string) {
  const [data, setData] = useState<TestPanelData | null>(null)
  const [pending, setPending] = useState<TestRunView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    loadPanel(templateId, true)
      .then((loaded) => live && setData(loaded))
      .catch((failure: unknown) => live && setError(failureMessage(failure)))
    return () => {
      live = false
    }
  }, [templateId])

  const reload = useCallback(async () => {
    try {
      setData(await loadPanel(templateId, false))
    } catch (failure) {
      setError(failureMessage(failure))
    }
  }, [templateId])

  const launch = useCallback(
    async (launches: Launch[]) => {
      setError(null)
      setNotice(null)
      setPending((current) => [...launches.map((item) => placeholderRun(item.placeholder)), ...current])
      const results = await Promise.allSettled(launches.map((item) => item.start()))
      const ids = new Set(launches.map((item) => item.placeholder.id))
      setPending((current) => current.filter((run) => !ids.has(run.id)))
      const rejected = results.find((result) => result.status === 'rejected')
      if (rejected) setError(failureMessage(rejected.reason))
      await reload()
    },
    [reload],
  )

  const runs = data ? mergeRuns(data.runs, pending) : pending
  return { data, runs, busy: pending.length > 0, error, notice, setError, setNotice, reload, launch }
}

export type TestPanelState = ReturnType<typeof useTestPanel>
