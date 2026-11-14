import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table'
import { Section } from '../growth-ui/section'
import type { TouchLine } from '../insights/landing'
import { INSIGHTS_COPY as COPY } from './copy'
import { StepCells, StepHeads } from './funnel-table'

const TOUCH = COPY.funnel.touch

function labelOf(line: TouchLine): string {
  if (line.key === '\u0000other') return TOUCH.other
  if (line.basis === 'none' || line.key === '') return TOUCH.noRecord
  return line.key === '(direct)' ? TOUCH.direct : line.key
}

function TouchTable({ title, column, lines }: { title: string; column: string; lines: TouchLine[] }) {
  return (
    <div className="grid min-w-0 gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="min-w-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">{column}</TableHead>
              <StepHeads />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={`${line.basis}:${line.key}`}>
                <TableCell className="max-w-[22rem] truncate" title={labelOf(line)}>
                  {labelOf(line)}
                  {line.basis === 'posthog' ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{TOUCH.inferred}</span> : null}
                </TableCell>
                <StepCells counts={line.counts} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

type Props = { byLanding: TouchLine[]; bySource: TouchLine[]; covered: { own: number; posthog: number; none: number } }

// 「落地页」 and 「来源网站 / utm」 (ARCHITECTURE §16.6), whole period, ignoring the source filter
// above (they are another way to split the same people) but keeping the language one.
export function TouchTables({ byLanding, bySource, covered }: Props) {
  return (
    <Section title={`${TOUCH.landingTitle} · ${TOUCH.sourceTitle}`} desc={TOUCH.desc}>
      <p className="text-sm text-muted-foreground">{TOUCH.covered(covered.own, covered.posthog, covered.none)}</p>
      <TouchTable title={TOUCH.landingTitle} column={TOUCH.landing} lines={byLanding} />
      <TouchTable title={TOUCH.sourceTitle} column={TOUCH.source} lines={bySource} />
    </Section>
  )
}
