import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table'
import { MetricLabel } from '../analytics-ui/parts'
import { Section } from '../growth-ui/section'
import type { Counts, FunnelSource } from '../insights/funnel'
import { INSIGHTS_COPY as COPY } from './copy'
import { StepCells, StepHeads } from './funnel-table'

type Line<K extends string> = { key: K; counts: Counts }

function Rows<K extends string>({ lines, labelOf }: { lines: Line<K>[]; labelOf: (key: K) => string }) {
  return lines.map((line) => (
    <TableRow key={line.key}>
      <TableCell className="whitespace-nowrap">{labelOf(line.key)}</TableCell>
      <StepCells counts={line.counts} />
    </TableRow>
  ))
}

// The whole period by source, then by language, in one table so the columns line up.
export function BreakdownTable({ bySource, byLocale }: { bySource: Line<FunnelSource>[]; byLocale: Line<'en' | 'zh'>[] }) {
  return (
    <Section title={COPY.funnel.breakdownTitle} desc={COPY.funnel.breakdownDesc}>
      <div className="min-w-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">
                <MetricLabel id="insights-source" metric={{ label: COPY.filters.source, help: COPY.sourceHelp }} />
              </TableHead>
              <StepHeads />
            </TableRow>
          </TableHeader>
          <TableBody>
            <Rows lines={bySource} labelOf={(key) => COPY.sources[key]} />
            <TableRow>
              <TableCell colSpan={6} className="pt-4 text-sm font-semibold">
                <MetricLabel id="insights-locale" metric={{ label: COPY.filters.locale, help: COPY.funnel.unknownLocale }} />
              </TableCell>
            </TableRow>
            <Rows lines={byLocale} labelOf={(key) => COPY.filters.locales[key]} />
          </TableBody>
        </Table>
      </div>
    </Section>
  )
}
