import Link from 'next/link'
import type { ReactNode } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { JOBS_COPY } from './copy'
import { refFilter, type JobFilters } from './filters'

const COPY = JOBS_COPY.filters
// w-full + min-w-0: a native select is as wide as its longest option unless told to fill its
// grid cell, which is how the template names ran under the model field (T78).
const SELECT = 'h-9 w-full min-w-0 truncate rounded-md border border-input bg-transparent px-3 text-base md:text-sm dark:bg-input/30'

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

// A reference number or any 6+ character prefix of the job id (T78).
function RefField({ value, invalid }: { value: string | undefined; invalid: boolean }) {
  return (
    <Field label={COPY.ref}>
      <Input
        name="ref"
        defaultValue={value ?? ''}
        placeholder={COPY.refPlaceholder}
        autoComplete="off"
        spellCheck={false}
        className="font-mono"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? 'jobs-ref-invalid' : undefined}
      />
    </Field>
  )
}

// Graylum's "table + filter bar", as a plain GET form so the filters live in the URL. Two rows
// of four from md, one row of eight from 2xl (the reference number first: it is what a user
// quotes), two columns on phones.
export function JobsFilters({ filters, templates }: { filters: JobFilters; templates: { id: string; name: string }[] }) {
  const badRef = refFilter(filters).invalid
  return (
    <form action="/admin/jobs" className="grid grid-cols-2 items-end gap-3 md:grid-cols-4 2xl:grid-cols-8">
      <RefField value={filters.ref} invalid={badRef} />
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
      <div className="flex h-9 items-center gap-3">
        <Button type="submit">{COPY.apply}</Button>
        <Link href="/admin/jobs" className="text-sm text-muted-foreground hover:text-foreground">
          {COPY.reset}
        </Link>
      </div>
      {badRef ? (
        <p id="jobs-ref-invalid" role="alert" className="col-span-full text-sm text-destructive">
          {COPY.refInvalid}
        </p>
      ) : null}
      <p className="col-span-full text-xs text-muted-foreground">{COPY.dates}</p>
    </form>
  )
}
