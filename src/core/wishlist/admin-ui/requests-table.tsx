import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { AdminRequest } from '../types'
import { COPY } from './copy'
import { RequestImages } from './request-images'
import { RequestRowActions } from './request-row-actions'
import type { TemplateOption } from './types'

// Admin is Chinese only (DESIGN §7), so dates use the zh-CN format directly.
const DATE = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })

type Props = {
  requests: AdminRequest[]
  templates: readonly TemplateOption[]
  pending: boolean
  onApprove: (request: AdminRequest) => void
  onReject: (request: AdminRequest) => void
  onShip: (request: AdminRequest) => void
}

export function RequestsTable({ requests, templates, pending, onApprove, onReject, onShip }: Props) {
  if (requests.length === 0) return <p className="text-muted-foreground py-8 text-center text-sm">{COPY.empty}</p>
  const templateName = (id: string) => templates.find((template) => template.id === id)?.name ?? id
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{COPY.columns.images}</TableHead>
          <TableHead>{COPY.columns.description}</TableHead>
          <TableHead>{COPY.columns.user}</TableHead>
          <TableHead>{COPY.columns.votes}</TableHead>
          <TableHead>{COPY.columns.created}</TableHead>
          <TableHead className="text-right">{COPY.columns.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => (
          <TableRow key={request.id}>
            <TableCell>
              <RequestImages urls={request.imageUrls} />
            </TableCell>
            <TableCell className="max-w-sm whitespace-normal">
              <p>{request.description}</p>
              {request.templateId && (
                <p className="text-muted-foreground mt-1 text-xs">{COPY.shippedAs(templateName(request.templateId))}</p>
              )}
            </TableCell>
            <TableCell className="font-mono text-xs">{request.email ?? COPY.noEmail}</TableCell>
            <TableCell>{request.votesCount}</TableCell>
            {/* Server and browser may sit in different time zones; the browser's reading wins. */}
            <TableCell suppressHydrationWarning>{DATE.format(new Date(request.createdAt))}</TableCell>
            <TableCell>
              <RequestRowActions request={request} pending={pending} onApprove={onApprove} onReject={onReject} onShip={onShip} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
