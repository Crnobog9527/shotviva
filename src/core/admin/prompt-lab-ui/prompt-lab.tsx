'use client'

import { useCallback, useEffect, useState } from 'react'
import type { LabModels, LabPage, LabPublishOptions, LabRun, LabState, LabVersion } from '../prompt-lab/types'
import type { TestBudget, TestPanelData } from '../test-runs'
import { labError, labRequest } from './api'
import { copy as c } from './copy'
import { Matrix } from './matrix'
import { Results } from './results'
import { Settings } from './settings'
import { Versions } from './versions'

type Props = { sessionId: string; assetId: string; archived: boolean; initial: LabState
  models: LabModels; summary: Pick<TestPanelData, 'budget' | 'recentPhotos'>; publish: LabPublishOptions }
function append<T extends { id: string }>(page: LabPage<T>, next: LabPage<T>) {
  const known = new Set(page.items.map(r => r.id))
  return { items: [...page.items, ...next.items.filter(r => !known.has(r.id))], next: next.next }
}
export function PromptLab({ sessionId, assetId, archived, initial, models, summary, publish }: Props) {
  const [runs, setRuns] = useState(initial.runs)
  const [versions, setVersions] = useState(initial.versions)
  const [budget, setBudget] = useState(summary.budget)
  const [error, setError] = useState('')
  const path = 'workspace?sessionId=' + sessionId + '&view='
  const refresh = useCallback(async () => {
    const result = await labRequest<{ runs: LabPage<LabRun>; budget: TestBudget }>('refresh', { sessionId })
    setRuns(result.runs); setBudget(result.budget); setError('')
  }, [sessionId])
  const pending = runs.items.some(r => r.status === 'queued' || r.status === 'running')
  useEffect(() => {
    if (!pending) return
    let reading = false
    async function tick() {
      if (document.hidden || reading) return
      reading = true
      try { await refresh() } catch (e) { setError(labError(e)) } finally { reading = false }
    }
    const timer = window.setInterval(() => void tick(), 5000)
    return () => window.clearInterval(timer)
  }, [pending, refresh])
  const refreshVersions = async () => {
    setVersions(await labRequest<LabPage<LabVersion>>(path + 'versions'))
    await refresh()
  }
  const moreVersions = async () => {
    if (!versions.next) return
    const next = await labRequest<LabPage<LabVersion>>(path + 'versions&cursor=' + encodeURIComponent(versions.next))
    setVersions(p => append(p, next))
  }
  const moreRuns = async () => {
    if (!runs.next) return
    const next = await labRequest<LabPage<LabRun>>(path + 'runs&cursor=' + encodeURIComponent(runs.next))
    setRuns(p => append(p, next))
  }
  return <div className="grid gap-5">{archived && <p role="status">{c.archived}</p>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(16rem,1fr)_minmax(20rem,2fr)_minmax(20rem,2fr)]">
      <aside className="grid gap-3"><h2>{c.reference}</h2>
        {/* eslint-disable-next-line @next/next/no-img-element -- Admin-authenticated reference gateway. */}
        <img src={'/admin-media/references/' + assetId} alt={c.referenceAlt} className="mx-auto max-h-72 rounded object-contain" />
        <Settings models={models.vision} /></aside>
      <Versions sessionId={sessionId} versions={versions} refresh={refreshVersions} more={moreVersions} archived={archived} />
      <Matrix sessionId={sessionId} versions={versions.items} models={models.image} recent={summary.recentPhotos} budget={budget} changed={refresh} archived={archived} />
    </div>
    <Results sessionId={sessionId} page={runs} publish={publish} changed={refresh} more={moreRuns} />
    {error && <p role="alert">{error}</p>}</div>
}
