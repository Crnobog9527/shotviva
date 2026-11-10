'use client'

import { useState, useTransition } from 'react'
import type { ImageProviderOption } from '../image-provider-field'
import type { PromptSnapshot, TemplateAdminActions, VersionSummary } from '../templates/types'
import type { TemplateFormValues } from './form-state'
import { versionCopy as copy } from './version-copy'
import { versionPatch } from './version-patch'

export type VersionActions = Pick<TemplateAdminActions, 'versions' | 'snapshot' | 'manageVersion'>
export type HistoryOptions = {
  actions: VersionActions
  values: TemplateFormValues
  providers: readonly ImageProviderOption[]
  onChange: (patch: Partial<TemplateFormValues>) => void
}
type VersionChange = { action: 'delete' } | { action: 'rename'; name: string }

function confirmChange(row: VersionSummary, action: VersionChange['action']): VersionChange | null {
  if (action === 'delete') return window.confirm(copy.removePrompt(row.version)) ? { action } : null
  const name = window.prompt(copy.namePrompt, row.display_name ?? '')
  return name === null ? null : { action, name: name.trim() }
}

function unavailableProvider(snapshot: PromptSnapshot | null, providers: HistoryOptions['providers']) {
  if (!snapshot?.providerId) return false
  return providers.find(provider => provider.id === snapshot.providerId)?.model !== snapshot.providerModel
}

export function usePromptHistory({ actions, values, providers, onChange }: HistoryOptions) {
  const [rows, setRows] = useState<VersionSummary[]>([])
  const [more, setMore] = useState(true)
  const [preview, setPreview] = useState<PromptSnapshot | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const unavailable = unavailableProvider(preview, providers)
  const request = (work: () => Promise<void>) => start(async () => {
    setError('')
    try { await work() } catch { setError(copy.loadError) }
  })
  const load = (version?: number) => request(async () => {
    if (version !== undefined) {
      const result = await actions.snapshot({ id: values.id, version })
      if (!result.ok) return setError(result.message)
      setPreview(result.value)
    } else {
      const page = await actions.versions({ id: values.id, before: rows.at(-1)?.version })
      if (!page.ok) return setError(page.message)
      setRows(current => [...current, ...page.value])
      setMore(page.value.length === 30)
    }
  })
  const manage = (row: VersionSummary, action: VersionChange['action']) => {
    const change = confirmChange(row, action)
    if (!change) return
    if (change.action === 'rename' && change.name.length > 80) return setError(copy.tooLong)
    request(async () => {
      const result = await actions.manageVersion({ id: values.id, version: row.version, ...change })
      if (!result.ok) return setError(result.message)
      if (change.action === 'rename') {
        setRows(current => current.map(item => item.version === row.version ? { ...item, display_name: change.name } : item))
      } else {
        setRows(current => current.filter(item => item.version !== row.version))
        if (preview?.version === row.version) setPreview(null)
        if (values.selectedVersion === row.version) onChange({ selectedVersion: undefined })
      }
    })
  }
  const choose = () => {
    if (preview && window.confirm(copy.confirm)) onChange(versionPatch(values, preview, !unavailable))
  }
  return { rows, more, preview, error, pending, unavailable, load, choose, manage }
}
