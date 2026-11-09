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
  onRefresh: (provider: AdminProvider) => void
  onTest: (provider: AdminProvider) => void
  onActivate: (provider: AdminProvider) => void
  onDelete: (provider: AdminProvider) => void
}

// UTC and fixed, so the server render and the browser agree.
const formatUpdatedAt = (iso: string) => `${new Date(iso).toISOString().slice(0, 19).replace('T', ' ')} UTC`

// Nine columns did not fit at 1280 (T78): the adapter goes under the name (one per module
// anyway), the address under the model, the update time under the status.
const COLUMNS = ['label', 'model', 'key', 'prices', 'status'] as const

// The buttons stay in view while a 1280 window scrolls the table sideways.
const STICKY = 'sticky right-0 bg-background shadow-[inset_1px_0_0_var(--border)]'

type Handlers = Pick<Props, 'onEdit' | 'onRefresh' | 'onTest' | 'onActivate' | 'onDelete'>
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
        {provider.module === 'image' && (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => handlers.onRefresh(provider)}>{COPY.refresh}</Button>
        )}
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
      {remove.hint ? <p className="text-muted-foreground mt-1 text-right text-xs whitespace-normal">{remove.hint}</p> : null}
      {result ? (
        <p role="status" className={`mt-1 text-right text-xs whitespace-normal ${result.ok ? 'text-success' : 'text-destructive'}`}>
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
          <TableHead className={`text-right ${STICKY}`}>{COPY.columns.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {providers.map((provider) => {
          const result = testResults[provider.id]
          return (
            <TableRow key={provider.id}>
              <TableCell>
                <div className="font-medium">{provider.label}</div>
                <div className="text-muted-foreground text-xs">{COPY.adapters[provider.adapter]}</div>
                {provider.notes ? (
                  <div className="text-muted-foreground max-w-48 truncate text-xs" title={provider.notes}>
                    {provider.notes}
                  </div>
                ) : null}
              </TableCell>
              <TableCell className="font-mono text-xs">
                <div>{provider.model}</div>
                {provider.module === 'image' && <div className="text-muted-foreground">{provider.resolutions.join(' / ').toUpperCase()}</div>}
                {provider.module === 'image' && <div className="text-muted-foreground">
                  {provider.capabilities ? COPY.fetched + ' ' + formatUpdatedAt(provider.capabilities.fetchedAt) : COPY.neverFetched}
                </div>}
                <div className="text-muted-foreground w-48 break-all whitespace-normal">{provider.baseUrl}</div>
              </TableCell>
              <TableCell className="font-mono text-xs">{COPY.keyMasked(provider.apiKeyLast4)}</TableCell>
              <TableCell>
                <PricesCell adapter={provider.adapter} prices={provider.prices} module={provider.module} model={provider.model} />
              </TableCell>
              <TableCell>
                <Badge variant={provider.isActive ? 'default' : 'secondary'}>{provider.isActive ? COPY.active : COPY.inactive}</Badge>
                <div className="text-muted-foreground mt-1 text-xs" title={COPY.columns.updatedAt}>
                  {formatUpdatedAt(provider.updatedAt)}
                </div>
              </TableCell>
              <TableCell className={`min-w-44 ${STICKY}`}>
                <RowActions provider={provider} result={result} testing={testing} pending={pending} handlers={handlers} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
