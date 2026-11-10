'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { TestPanelData, TestRunView } from '../test-runs'
import { cleanupPanel, loadSummary, loadRecords } from './api'
import { useOpeningSummary } from './summary-provider'
import { failureMessage } from './messages'
import { mergeRuns, placeholderRun, type Placeholder } from './placeholder'
import { onRunsChanged } from './runs-changed'

export type Launch = { placeholder: Placeholder; start: () => Promise<TestRunView> }

// The panel's state (ARCHITECTURE §10.b): the server's data, loaded once with the 30-day cleanup
// when the panel opens; runs still in flight; and the last failure or notice. A launch shows its
// placeholders at once, runs every request together, then reloads (budget, photo URLs).
export function useTestPanel(templateId: string) {
  const [data, setData] = useState<Partial<TestPanelData>>({})
  const [pending, setPending] = useState<TestRunView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const openingSummary = useOpeningSummary()
  const generation = useRef(0)
  const reload = useCallback(async (opening = false) => {
    const current = ++generation.current
    const showError = (e: unknown) => { if (current === generation.current) setError(failureMessage(e)) }
    const summary = opening ? openingSummary() : loadSummary()
    const records = loadRecords(templateId)
    const update = (section: Partial<TestPanelData>) => {
      if (current === generation.current) setData(previous => ({ ...previous, ...section }))
    }
    await Promise.all([summary.then(update).catch(showError), records.then(update).catch(showError)])
  }, [openingSummary, templateId])

  useEffect(() => {
    void reload(true)
    void cleanupPanel().catch(() => undefined)
    const requests = generation
    return () => { requests.current++ }
  }, [reload])

  // A cover translation finished elsewhere on the page (T87): show it and the new spend.
  useEffect(() => onRunsChanged(() => void reload()), [reload])

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

  const runs = mergeRuns(data.runs ?? [], pending)
  return { data, runs, busy: pending.length > 0, error, notice, setError, setNotice, reload, launch }
}

export type TestPanelState = ReturnType<typeof useTestPanel>
