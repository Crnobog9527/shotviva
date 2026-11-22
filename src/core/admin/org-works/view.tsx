import Link from 'next/link'
import type { ReactNode } from 'react'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { CopyText } from '@/core/ui/copy-text'
import { Input } from '@/core/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { Page } from '../cursor'
import { formatBeijing } from '../shell/format'
import { JobActions, type JobSupportActions } from '../support-ui'
import { UserLink } from '../users-ui/user-link'
import { ORG_WORKS_COPY as COPY } from './copy'
import { ORG_WORK_STATUSES, orgWorksHref, workFilter, type OrgWorkFilters } from './filters'
import type { AdminOrgWork } from './repository'
import { OrgWorkThumbImage, OrgWorkThumbPlaceholder } from './thumb-image'

// 企业作品 on /admin/orgs/[id]: a GET filter form (member, status, work id) and one page of the
// org's works. 查看 / 补偿 are the jobs list's own actions (audited view_work dialog, T25); the
// reference links to the same work in 出图记录 for model, resolution and error code. Provider
// cost is never shown here.

export type OrgWorksMember = { userId: string; label: string }

type Props = {
  orgId: string
  filters: OrgWorkFilters
  page: Page<AdminOrgWork>
  members: OrgWorksMember[]
  actions: JobSupportActions
}

const SELECT = 'h-9 w-full min-w-0 truncate rounded-md border border-input bg-transparent px-3 text-base md:text-sm dark:bg-input/30'
const STICKY = 'sticky right-0 bg-card shadow-[inset_1px_0_0_var(--border)]'
const statusVariant = { running: 'secondary', succeeded: 'default', failed: 'destructive' } as const

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

function Filters({ orgId, filters, members }: Pick<Props, 'orgId' | 'filters' | 'members'>) {
  const invalid = workFilter(filters).invalid
  return (
    <form action={`/admin/orgs/${orgId}#works`} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label={COPY.filters.member}>
        <select name="member" defaultValue={filters.member ?? ''} className={SELECT}>
          <option value="">{COPY.filters.any}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>{m.label}</option>
          ))}
        </select>
      </Field>
      <Field label={COPY.filters.status}>
        <select name="status" defaultValue={filters.status ?? ''} className={SELECT}>
          <option value="">{COPY.filters.any}</option>
          {ORG_WORK_STATUSES.map((s) => (
            <option key={s} value={s}>{COPY.status[s]}</option>
          ))}
        </select>
      </Field>
      <Field label={COPY.filters.work}>
        <Input
          name="work"
          defaultValue={filters.work ?? ''}
          placeholder={COPY.filters.workPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'org-works-invalid' : undefined}
        />
      </Field>
      <div className="flex h-9 items-center gap-3">
        <Button type="submit">{COPY.filters.apply}</Button>
        <Link href={orgWorksHref(orgId, {})} className="text-sm text-muted-foreground hover:text-foreground">{COPY.filters.reset}</Link>
      </div>
      {invalid ? <p id="org-works-invalid" role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-4">{COPY.filters.workInvalid}</p> : null}
    </form>
  )
}

// A succeeded, kept work shows its small picture (the admin thumb route); anything else a placeholder.
function Thumb({ work }: { work: AdminOrgWork }) {
  if (work.status !== 'succeeded' || work.deletedByUser) return <OrgWorkThumbPlaceholder label={COPY.noThumb} />
  return <OrgWorkThumbImage jobId={work.id} fallback={COPY.noThumb} />
}

function Credits({ work }: { work: AdminOrgWork }) {
  const parts = (['orgPaid', 'orgPromo', 'personal'] as const).filter((k) => work.credits[k] > 0)
  return (
    <div className="grid gap-0.5 text-xs whitespace-nowrap">
      <span className="font-mono tabular-nums">{work.creditsCost}</span>
      {parts.map((k) => (
        <span key={k} className="text-muted-foreground">{COPY.pools[k]} {work.credits[k]}</span>
      ))}
    </div>
  )
}

function Status({ work }: { work: AdminOrgWork }) {
  return (
    <div className="grid justify-items-start gap-1">
      <Badge variant={statusVariant[work.status]}>{COPY.status[work.status]}</Badge>
      {work.refunded > 0 ? <span className="text-xs text-muted-foreground">{COPY.refunded(work.refunded)}</span> : null}
      {work.errorCode ? <span className="font-mono text-xs text-destructive [overflow-wrap:anywhere]">{work.errorCode}</span> : null}
      {work.deletedByUser ? <span className="text-xs text-muted-foreground">{COPY.deletedByUser}</span> : null}
      {work.makerLeft ? <span className="text-xs text-muted-foreground">{COPY.makerLeft}</span> : null}
    </div>
  )
}

function WorkRow({ work, label, actions }: { work: AdminOrgWork; label: string; actions: JobSupportActions }) {
  return (
    <TableRow>
      <TableCell><Thumb work={work} /></TableCell>
      <TableCell className="text-xs">
        <CopyText value={work.id} label={COPY.copyId} copied={COPY.copied}>{work.ref}</CopyText>
      </TableCell>
      <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(work.createdAt)}</TableCell>
      <TableCell className="max-w-48 text-xs [overflow-wrap:anywhere]">
        <UserLink userId={work.userId} jobId={work.id}>{label}</UserLink>
      </TableCell>
      <TableCell className="min-w-32 text-xs">
        <div>{work.templateName ?? work.templateId}</div>
        {work.templateName ? <div className="font-mono text-muted-foreground">{work.templateId}</div> : null}
      </TableCell>
      <TableCell><Status work={work} /></TableCell>
      <TableCell><Credits work={work} /></TableCell>
      <TableCell className={STICKY}>
        <div className="flex items-center gap-1">
          <JobActions job={work} actions={actions} />
          <Link href={`/admin/jobs?ref=${work.ref}`} title={COPY.openInJobsHint} className="text-xs whitespace-nowrap text-primary hover:underline">{COPY.openInJobs}</Link>
        </div>
      </TableCell>
    </TableRow>
  )
}

// Below 640px the table would hide member and status behind a sideways scroll: one card per work.
function WorkCard({ work, label, actions }: { work: AdminOrgWork; label: string; actions: JobSupportActions }) {
  return (
    <li className="grid gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex gap-3">
        <Thumb work={work} />
        <div className="grid min-w-0 flex-1 gap-1 text-xs">
          <div className="flex items-center justify-between gap-2">
            <CopyText value={work.id} label={COPY.copyId} copied={COPY.copied}>{work.ref}</CopyText>
            <span className="font-mono text-muted-foreground">{formatBeijing(work.createdAt)}</span>
          </div>
          <UserLink userId={work.userId} jobId={work.id} className="[overflow-wrap:anywhere]">{label}</UserLink>
          <div className="text-muted-foreground">{work.templateName ?? work.templateId}</div>
        </div>
      </div>
      <div className="flex items-start justify-between gap-3">
        <Status work={work} />
        <Credits work={work} />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <JobActions job={work} actions={actions} />
        <Link href={`/admin/jobs?ref=${work.ref}`} title={COPY.openInJobsHint} className="inline-flex min-h-9 items-center px-2 text-xs text-primary hover:underline">{COPY.openInJobs}</Link>
      </div>
    </li>
  )
}

export function OrgWorksSection({ orgId, filters, page, members, actions }: Props) {
  const labels = new Map(members.map((m) => [m.userId, m.label]))
  const { cursor, ...kept } = filters
  return (
    <section id="works" className="grid scroll-mt-20 gap-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-medium">{COPY.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{COPY.hint}</p>
      </div>
      <Filters orgId={orgId} filters={filters} members={members} />
      {page.items.length === 0 ? <p className="text-sm text-muted-foreground">{COPY.empty}</p> : (
        <>
        <ul className="sm:hidden">
          {page.items.map((work) => (
            <WorkCard key={work.id} work={work} label={labels.get(work.userId) ?? COPY.unknownMember(work.userId)} actions={actions} />
          ))}
        </ul>
        <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16"><span className="sr-only">{COPY.columns.work}</span></TableHead>
              <TableHead>{COPY.columns.work}</TableHead>
              <TableHead>{COPY.columns.createdAt}</TableHead>
              <TableHead>{COPY.columns.member}</TableHead>
              <TableHead>{COPY.columns.template}</TableHead>
              <TableHead>{COPY.columns.status}</TableHead>
              <TableHead>{COPY.columns.credits}</TableHead>
              <TableHead className={STICKY}>{COPY.columns.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((work) => (
              <WorkRow key={work.id} work={work} label={labels.get(work.userId) ?? COPY.unknownMember(work.userId)} actions={actions} />
            ))}
          </TableBody>
        </Table>
        </div>
        </>
      )}
      {cursor || page.nextCursor ? (
        <div className="flex flex-wrap gap-4 text-sm">
          {cursor ? <Link href={orgWorksHref(orgId, kept)} className="text-primary hover:underline">{COPY.first}</Link> : null}
          {page.nextCursor ? <Link href={orgWorksHref(orgId, kept, page.nextCursor)} className="text-primary hover:underline">{COPY.next}</Link> : null}
        </div>
      ) : null}
    </section>
  )
}
