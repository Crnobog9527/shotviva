'use client'

import { useState, useTransition } from 'react'

import type { BulkTaskOutcome } from '../templates/bulk-task-rules'
import type { ActionValue, AdminTemplate, TemplateAdminActions } from '../templates/types'
import { bulkMoreCopy as copy } from './bulk-more-copy'
import { movedOrders, planTask, type BulkTask } from './bulk-task-plan'

export type TaskActions = Pick<TemplateAdminActions, 'removeMany' | 'setSaleMany' | 'setSeriesMany' | 'duplicate' | 'setOrder'>
// names: captured when confirmed, since deleted or moved templates leave the list right after.
export type TaskResult = { task: BulkTask; outcome: BulkTaskOutcome; names: ReadonlyMap<string, string> } | null

// 复制所选: one copy at a time through the single 复制 path, each with its own request id.
async function duplicateEach(duplicate: TaskActions['duplicate'], ids: string[]): Promise<ActionValue<BulkTaskOutcome>> {
  const outcome: BulkTaskOutcome = { done: [], skipped: [] }
  for (const source of ids) {
    const result = await duplicate({ source, requestId: crypto.randomUUID() })
    if (result.ok) outcome.done.push(source)
    else outcome.skipped.push({ id: source, reason: result.message })
  }
  return { ok: true, value: outcome }
}

function send(actions: TaskActions, task: BulkTask, ids: string[], seriesId: string | null) {
  switch (task) {
    case 'delete': return actions.removeMany({ ids })
    case 'saleOn': return actions.setSaleMany({ ids, enabled: true })
    case 'saleOff': return actions.setSaleMany({ ids, enabled: false })
    case 'seriesJoin': return actions.setSeriesMany({ ids, seriesId })
    case 'seriesLeave': return actions.setSeriesMany({ ids, seriesId: null })
    case 'duplicate': return duplicateEach(actions.duplicate, ids)
  }
}

// The further batch actions' state: which confirm step is open, the call in flight, its result.
export function useBulkTasks(actions: TaskActions, selected: AdminTemplate[], all: readonly AdminTemplate[], onDone: () => void) {
  const [asking, setAsking] = useState<BulkTask | null>(null)
  const [result, setResult] = useState<TaskResult>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string; ids?: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const begin = () => { setResult(null); setMessage(null) }

  const confirm = (seriesId: string | null) => {
    const task = asking
    if (!task) return
    const ids = planTask(task, selected).will.map(t => t.id)
    const names = new Map(selected.map(t => [t.id, t.name]))
    setAsking(null)
    begin()
    startTransition(async () => {
      try {
        const response = await send(actions, task, ids, seriesId)
        if (!response.ok) return setMessage({ ok: false, text: response.message })
        setResult({ task, outcome: response.value, names })
        onDone()
      } catch {
        setMessage({ ok: false, text: copy.offline })
      }
    })
  }

  const move = (top: boolean) => {
    begin()
    const orders = movedOrders(all, new Set(selected.map(t => t.id)), top)
    startTransition(async () => {
      for (const order of orders) {
        const response = await actions.setOrder(order).catch(() => ({ ok: false as const, code: 'NETWORK', message: copy.offline }))
        if (!response.ok) return setMessage({ ok: false, text: response.message })
      }
      setMessage({ ok: true, text: copy.ordered(selected.length, top) })
    })
  }

  const copyIds = async () => {
    begin()
    const ids = selected.map(t => t.id).join('\n')
    try {
      await navigator.clipboard.writeText(ids)
      setMessage({ ok: true, text: copy.copied(selected.length) })
    } catch {
      setMessage({ ok: false, text: copy.copyFailed, ids })
    }
  }

  return { asking, ask: (task: BulkTask) => { begin(); setAsking(task) }, cancel: () => setAsking(null), confirm, move, copyIds,
    pending, result, message, dismiss: begin }
}

export type BulkTasks = ReturnType<typeof useBulkTasks>
