import Link from 'next/link'
import type { ReactNode } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { JOBS_COPY } from './copy'
import type { JobFilters } from './filters'

const COPY = JOBS_COPY.filters
const SELECT = 'h-9 rounded-md border border-input bg-transparent px-3 text-sm'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

function Options({ entries }: { entries: [string, string][] }) {
  return (
    <>
      <option value="">{COPY.any}</option>
      {entries.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </>
  )
}

// Graylum's "table + filter bar", as a plain GET form so the filters live in the URL.
export function JobsFilters({ filters, templates }: { filters: JobFilters; templates: { id: string; name: string }[] }) {
  return (
    <form action="/admin/jobs" className="grid grid-cols-2 items-end gap-3 md:grid-cols-4 lg:grid-cols-7">
      <Field label={COPY.status}>
        <select name="status" defaultValue={filters.status ?? ''} className={SELECT}>
          <Options entries={Object.entries(JOBS_COPY.status)} />
        </select>
      </Field>
      <Field label={COPY.template}>
        <select name="template" defaultValue={filters.template ?? ''} className={SELECT}>
          <Options entries={templates.map((t) => [t.id, t.name])} />
        </select>
      </Field>
      <Field label={COPY.model}>
        <Input name="model" defaultValue={filters.model ?? ''} placeholder={COPY.modelPlaceholder} />
      </Field>
      <Field label={COPY.source}>
        <select name="source" defaultValue={filters.source ?? ''} className={SELECT}>
          <Options entries={Object.entries(JOBS_COPY.sources)} />
        </select>
      </Field>
      <Field label={COPY.from}>
        <Input type="date" name="from" defaultValue={filters.from ?? ''} />
      </Field>
      <Field label={COPY.to}>
        <Input type="date" name="to" defaultValue={filters.to ?? ''} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit">{COPY.apply}</Button>
        <Link href="/admin/jobs" className="text-sm text-muted-foreground hover:text-foreground">
          {COPY.reset}
        </Link>
      </div>
      <p className="col-span-full text-xs text-muted-foreground">{COPY.dates}</p>
    </form>
  )
}
