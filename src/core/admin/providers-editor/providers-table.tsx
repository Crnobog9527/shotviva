'use client'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { AdminProvider } from '../providers/types'

import { PROVIDERS_COPY as COPY } from './copy'
import { PricesCell } from './prices-cell'
import { deleteControl } from './row-actions'

type Props = {
  providers: AdminProvider[]
  // Last connection test outcome per provider id, already translated.
  testResults: Record<string, { ok: boolean; text: string }>
  testing: string | null
  pending: boolean
  onEdit: (provider: AdminProvider) => void
  onTest: (provider: AdminProvider) => void
  onActivate: (provider: AdminProvider) => void
  onDelete: (provider: AdminProvider) => void
}

// UTC and fixed, so the server render and the browser agree.
const formatUpdatedAt = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`

const COLUMNS = ['label', 'adapter', 'baseUrl', 'model', 'key', 'prices', 'status', 'updatedAt'] as const

type Handlers = Pick<Props, 'onEdit' | 'onTest' | 'onActivate' | 'onDelete'>
type RowProps = { provider: AdminProvider; result: { ok: boolean; text: string } | undefined; testing: string | null; pending: boolean; handlers: Handlers }

// Edit, test, switch and delete for one row, with the last test outcome under them.
function RowActions({ provider, result, testing, pending, handlers }: RowProps) {
  const remove = deleteControl(provider, pending)
  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => handlers.onEdit(provider)}>
          {COPY.edit}
        </Button>
        <Button variant="outline" size="sm" disabled={pending || testing !== null} onClick={() => handlers.onTest(provider)}>
          {testing === provider.id ? COPY.testing : COPY.test}
        </Button>
        {provider.isActive ? null : (
          <Button size="sm" disabled={pending} onClick={() => handlers.onActivate(provider)}>
            {COPY.activate}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          disabled={remove.disabled}
          title={remove.hint ?? undefined}
          onClick={() => handlers.onDelete(provider)}
        >
          {COPY.delete}
        </Button>
      </div>
      {remove.hint ? <p className="text-muted-foreground mt-1 text-right text-xs">{remove.hint}</p> : null}
      {result ? (
        <p role="status" className={`mt-1 text-right text-xs ${result.ok ? 'text-emerald-700' : 'text-destructive'}`}>
          {result.text}
        </p>
      ) : null}
    </>
  )
}

export function ProvidersTable({ providers, testResults, testing, pending, ...handlers }: Props) {
  if (providers.length === 0) return <p className="text-muted-foreground py-8 text-center text-sm">{COPY.empty}</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead key={column}>{COPY.columns[column]}</TableHead>
          ))}
          <TableHead className="text-right">{COPY.columns.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {providers.map((provider) => {
          const result = testResults[provider.id]
          return (
            <TableRow key={provider.id}>
              <TableCell>
                <div className="font-medium">{provider.label}</div>
                {provider.notes ? <div className="text-muted-foreground max-w-48 truncate text-xs">{provider.notes}</div> : null}
              </TableCell>
              <TableCell>{COPY.adapters[provider.adapter]}</TableCell>
              <TableCell className="font-mono text-xs">{provider.baseUrl}</TableCell>
              <TableCell className="font-mono text-xs">{provider.model}</TableCell>
              <TableCell className="font-mono text-xs">{COPY.keyMasked(provider.apiKeyLast4)}</TableCell>
              <TableCell>
                <PricesCell prices={provider.prices} module={provider.module} model={provider.model} />
              </TableCell>
              <TableCell>
                <Badge variant={provider.isActive ? 'default' : 'secondary'}>{provider.isActive ? COPY.active : COPY.inactive}</Badge>
              </TableCell>
              <TableCell className="text-xs">{formatUpdatedAt(provider.updatedAt)}</TableCell>
              <TableCell>
                <RowActions provider={provider} result={result} testing={testing} pending={pending} handlers={handlers} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
