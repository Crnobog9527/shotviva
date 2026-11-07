'use client'

import { useState } from 'react'

import { PROVIDER_MODULES, type ProviderModule } from '@/core/providers/types'

import type { AdminProvider, ProviderAdminActions } from '../providers/types'

import { ActivateDialog } from './activate-dialog'
import { connectionText, PROVIDERS_COPY as COPY } from './copy'
import { DeleteDialog } from './delete-dialog'
import { toSaveInput, type ProviderForm } from './form-state'
import { ProviderFormDialog } from './provider-form-dialog'
import { ProviderSection } from './provider-section'
import { useProviderActions } from './use-provider-actions'

type Props = { providers: AdminProvider[]; actions: ProviderAdminActions }

type Editing = { provider: AdminProvider | null; module: ProviderModule }

// /admin/providers (ARCHITECTURE §3.3): per module, list, add / edit, test connection, switch the
// active one. 'decision' is the photo-edit range check (§5.2).
export function ProvidersEditor({ providers, actions }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const [activating, setActivating] = useState<AdminProvider | null>(null)
  const [deleting, setDeleting] = useState<AdminProvider | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; text: string }>>({})
  const { pending, error, notice, run, clearError } = useProviderActions()
  // The one in use in the module being switched, for the confirmation text.
  const current = providers.find((provider) => provider.isActive && provider.module === activating?.module) ?? null

  const open = (provider: AdminProvider | null, module: ProviderModule = provider?.module ?? 'image') => {
    clearError()
    setEditing({ provider, module })
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
  const remove = (target: AdminProvider) => {
    setDeleting(null)
    run(() => actions.remove({ id: target.id }), () => COPY.deleteDialog.done(target.label))
  }

  return (
    <div className="grid gap-8">
      {notice ? <p className="text-sm text-success">{notice}</p> : null}
      {error && !editing ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {PROVIDER_MODULES.map((module) => (
        <ProviderSection
          key={module}
          module={module}
          providers={providers.filter((provider) => provider.module === module)}
          testResults={testResults}
          testing={testing}
          pending={pending}
          onAdd={(m) => open(null, m)}
          onEdit={(provider) => open(provider)}
          onTest={test}
          onActivate={setActivating}
          onDelete={setDeleting}
        />
      ))}
      {editing ? (
        <ProviderFormDialog
          key={editing.provider?.id ?? 'new'}
          provider={editing.provider}
          module={editing.module}
          pending={pending}
          error={error}
          onCancel={() => setEditing(null)}
          onSubmit={save}
        />
      ) : null}
      <ActivateDialog target={activating} current={current} pending={pending} onCancel={() => setActivating(null)} onConfirm={activate} />
      <DeleteDialog target={deleting} pending={pending} onCancel={() => setDeleting(null)} onConfirm={remove} />
    </div>
  )
}
