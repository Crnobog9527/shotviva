import type { readProductCatalog } from '@/core/billing/product-catalog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { PRODUCTS_COPY as COPY } from './copy'

export function CatalogTable({ rows }: { rows: Awaited<ReturnType<typeof readProductCatalog>> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>{COPY.columns.map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(row => (
          <TableRow key={row.product_id}>
            <TableCell>{row.name_zh}<span className="block text-xs text-muted-foreground" lang="en">{row.name_en}</span></TableCell>
            <TableCell className="font-mono">{row.product_id}</TableCell>
            <TableCell>${(row.usd_cents / 100).toFixed(2)}</TableCell>
            <TableCell>{row.credits.toLocaleString('zh-CN')}</TableCell>
            <TableCell>{row.paid_days ?? COPY.noDays}</TableCell>
            <TableCell>{row.revision}</TableCell>
            <TableCell>{row.listed ? COPY.listed : COPY.unlisted}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
