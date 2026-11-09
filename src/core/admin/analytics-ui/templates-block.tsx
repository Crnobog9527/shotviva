import { createAdminSupabase } from '../../auth'
import { logger } from '../../logger'
import { listTemplateOptions } from '../jobs/repository'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table'
import { readTemplates } from '../analytics/load'
import { sqlEditorLink } from '../analytics/links'
import type { Range } from '../analytics/range'
import { templateUseQuery, type TemplateRow } from '../analytics/templates'
import { ANALYTICS_COPY } from './copy'
import { n, pct } from './format'
import { BlockFrame, Empty, MetricLabel, Unavailable } from './parts'

const COPY = ANALYTICS_COPY.templates
const NUM = 'text-right font-mono tabular-nums'
const KEYS = ['views', 'uses', 'users', 'successRate', 'buyers'] as const

export function TemplatesTable({ rows, names }: { rows: TemplateRow[]; names: Record<string, string> }) {
  if (rows.length === 0) return <Empty />
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{COPY.template}</TableHead>
          {KEYS.map((key) => (
            <TableHead key={key} className="text-right whitespace-nowrap">
              <MetricLabel id={`tpl-${key}`} metric={COPY.metrics[key]} className="justify-end" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.templateId}>
            <TableCell className="max-w-56">
              <span className="block truncate">{names[row.templateId] ?? row.templateId}</span>
              {names[row.templateId] ? <span className="block truncate font-mono text-xs text-muted-foreground">{row.templateId}</span> : null}
            </TableCell>
            <TableCell className={NUM}>{n(row.views)}</TableCell>
            <TableCell className={NUM}>{n(row.uses)}</TableCell>
            <TableCell className={NUM}>{n(row.users)}</TableCell>
            <TableCell className={NUM}>{pct(row.successRate)}</TableCell>
            <TableCell className={NUM}>{n(row.buyers)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

async function templateNames(): Promise<Record<string, string>> {
  try {
    return Object.fromEntries((await listTemplateOptions(createAdminSupabase())).map((t) => [t.id, t.name]))
  } catch (error) {
    logger.warn('admin.analytics.template_names_failed', { error })
    return {}
  }
}

export async function TemplatesBlock({ range, projectId }: { range: Range; projectId: string }) {
  const [block, names] = await Promise.all([readTemplates(range), templateNames()])
  const links = block.status === 'ok' ? [{ href: sqlEditorLink(projectId, templateUseQuery(block.window)), label: ANALYTICS_COPY.openInPostHog }] : []
  return (
    <BlockFrame title={COPY.title} desc={COPY.desc} links={links}>
      {block.status === 'ok' ? <TemplatesTable rows={block.data} names={names} /> : <Unavailable />}
    </BlockFrame>
  )
}
