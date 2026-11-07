'use client'

import { Button } from '@/core/ui/button'

import type { ProviderModule } from '@/core/providers/types'

import type { AdminProvider } from '../providers/types'

import { PROVIDERS_COPY as COPY } from './copy'
import { ProvidersTable } from './providers-table'

type Props = {
  module: ProviderModule
  providers: AdminProvider[]
  testResults: Record<string, { ok: boolean; text: string }>
  testing: string | null
  pending: boolean
  onAdd: (module: ProviderModule) => void
  onEdit: (provider: AdminProvider) => void
  onTest: (provider: AdminProvider) => void
  onActivate: (provider: AdminProvider) => void
  onDelete: (provider: AdminProvider) => void
}

// One module's providers: what it is for, whether one is switched on, and its rows.
export function ProviderSection({ module, providers, onAdd, ...table }: Props) {
  const copy = COPY.modules[module]
  const anyActive = providers.some((provider) => provider.isActive)
  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{copy.title}</h2>
        <Button className="ml-auto" size="sm" onClick={() => onAdd(module)}>
          {COPY.add}
        </Button>
      </div>
      <p className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">{copy.notice}</p>
      {anyActive ? null : <p className="text-muted-foreground text-sm">{copy.none}</p>}
      <ProvidersTable providers={providers} {...table} />
    </section>
  )
}
