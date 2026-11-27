import Link from 'next/link'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { ORGS_COPY as COPY } from '../orgs/copy'
import type { OrgAffiliate } from '../orgs/types'
import { Card } from './fields'

const percent = (bp: number) => `${(bp / 100).toFixed(2).replace(/\.?0+$/, '')}%`

// Read-only: the rates and the settlement live on the affiliate account (/admin/affiliates),
// which already refuses a team or a parent on an enterprise account.
export function AffiliateCard({ affiliate, levels }: { affiliate: OrgAffiliate | null; levels: 1 | 2 }) {
  if (!affiliate) return <Card title={COPY.affAccountTitle}><p className="text-sm text-muted-foreground">{COPY.affAccountNone}</p></Card>
  return (
    <Card title={COPY.affAccountTitle}>
      <p className="text-sm">
        {COPY.affAccountStatus}：{COPY.affStatus[affiliate.status] ?? affiliate.status}
        <span className="ml-2 font-mono text-xs text-muted-foreground">{affiliate.slug}</span>
      </p>
      <div>
        <h3 className="mb-2 text-sm font-medium">{COPY.affRatesTitle}</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead className="text-right">一级</TableHead>
              {levels === 2 ? <TableHead className="text-right">二级</TableHead> : null}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {affiliate.rates.map((rate) => (
              <TableRow key={rate.productKind}>
                <TableCell>{COPY.affKinds[rate.productKind] ?? rate.productKind}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{percent(rate.l1Bp)}</TableCell>
                {levels === 2 ? <TableCell className="text-right font-mono tabular-nums">{percent(rate.l2Bp)}</TableCell> : null}
                <TableCell className="text-xs text-muted-foreground">{rate.overridden ? COPY.affRateOverride : COPY.affRateDefault}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Link className="text-sm underline-offset-4 hover:underline" href={`/admin/affiliates?tab=affiliates&id=${affiliate.userId}`}>{COPY.affAccountOpen} →</Link>
    </Card>
  )
}
