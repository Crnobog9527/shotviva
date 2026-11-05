'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'

import type { AdminProvider, ProviderAdminActions } from '../providers/types'

import { ActivateDialog } from './activate-dialog'
import { connectionText, PROVIDERS_COPY as COPY } from './copy'
import { toSaveInput, type ProviderForm } from './form-state'
import { ProviderFormDialog } from './provider-form-dialog'
import { ProvidersTable } from './providers-table'
import { useProviderActions } from './use-provider-actions'

type Props = { providers: AdminProvider[]; actions: ProviderAdminActions }

type Editing = { provider: AdminProvider | null }

// /admin/providers (ARCHITECTURE §3.3): list, add / edit, test connection, switch the active one.
export function ProvidersEditor({ providers, actions }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const [activating, setActivating] = useState<AdminProvider | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; text: string }>>({})
  const { pending, error, notice, run, clearError } = useProviderActions()
  const current = providers.find((provider) => provider.isActive) ?? null

  const open = (provider: AdminProvider | null) => {
    clearError()
    setEditing({ provider })
  }
  const save = (form: ProviderForm) => {
    const provider = editing?.provider ?? null
    run(
      () => actions.save(toSaveInput(form, provider)),
      () => {
        setEditing(null)
        return COPY.form.saved(form.label.trim())
      },
    )
  }
  const test = async (provider: AdminProvider) => {
    setTesting(provider.id)
    const result = await actions.test({ id: provider.id }).catch(() => ({ ok: false, reason: 'internal' }) as const)
    setTesting(null)
    const entry = result.ok
      ? { ok: result.value.ok, text: connectionText(result.value) }
      : { ok: false, text: COPY.errors[result.reason] }
    setTestResults((prev) => ({ ...prev, [provider.id]: entry }))
  }
  const activate = (target: AdminProvider) => {
    setActivating(null)
    run(() => actions.activate({ id: target.id }), () => COPY.activateDialog.done(target.label))
  }

  return (
    <div className="grid gap-4">
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{COPY.floorNotice}</p>
      {current ? null : <p className="text-muted-foreground text-sm">{COPY.envFallback}</p>}
      <div className="flex">
        <Button className="ml-auto" onClick={() => open(null)}>
          {COPY.add}
        </Button>
      </div>
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      {error && !editing ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <ProvidersTable
        providers={providers}
        testResults={testResults}
        testing={testing}
        pending={pending}
        onEdit={open}
        onTest={test}
        onActivate={setActivating}
      />
      {editing ? (
        <ProviderFormDialog
          key={editing.provider?.id ?? 'new'}
          provider={editing.provider}
          pending={pending}
          error={error}
          onCancel={() => setEditing(null)}
          onSubmit={save}
        />
      ) : null}
      <ActivateDialog target={activating} current={current} pending={pending} onCancel={() => setActivating(null)} onConfirm={activate} />
    </div>
  )
}
