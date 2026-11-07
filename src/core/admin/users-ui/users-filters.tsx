import Link from 'next/link'
import type { ReactNode } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import type { UserFilters } from '../users/list-filters'
import { SIGNUP_PROVIDERS, USER_SORTS, USER_STATUSES, USER_TIERS } from '../users/list-types'
import { USERS_COPY } from './copy'

const COPY = USERS_COPY.filters
const SELECT = 'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

function Choice({ name, value, options, labels, any = true }: { name: string; value: string | undefined; options: readonly string[]; labels: Record<string, string>; any?: boolean }) {
  return (
    <select name={name} defaultValue={value ?? ''} className={SELECT}>
      {any ? <option value="">{COPY.any}</option> : null}
      {options.map((option) => (
        <option key={option} value={option}>
          {labels[option]}
        </option>
      ))}
    </select>
  )
}

// The lookup box and the filter bar are one GET form, so a search and its filters live in the URL
// together and submitting starts again from page 1. The box still opens the one user an id, an
// order number or an email that only one account has points at (admin_lookup).
export function UsersFilters({ filters }: { filters: UserFilters }) {
  return (
    <form action="/admin/users" role="search" className="grid gap-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label={USERS_COPY.search.label}>
            <Input name="q" type="search" defaultValue={filters.q ?? ''} placeholder={USERS_COPY.search.placeholder} />
          </Field>
        </div>
        <Button type="submit">{USERS_COPY.search.submit}</Button>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">{USERS_COPY.search.hint}</p>
      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]">
        <Field label={COPY.tier}>
          <Choice name="tier" value={filters.tier} options={USER_TIERS} labels={USERS_COPY.tiers} />
        </Field>
        <Field label={COPY.provider}>
          <Choice name="provider" value={filters.provider} options={SIGNUP_PROVIDERS} labels={USERS_COPY.providers} />
        </Field>
        <Field label={COPY.status}>
          <Choice name="status" value={filters.status} options={USER_STATUSES} labels={USERS_COPY.statuses} />
        </Field>
        <Field label={COPY.from}>
          <Input type="date" name="from" defaultValue={filters.from ?? ''} className="min-w-0" />
        </Field>
        <Field label={COPY.to}>
          <Input type="date" name="to" defaultValue={filters.to ?? ''} className="min-w-0" />
        </Field>
        <Field label={COPY.sort}>
          <Choice name="sort" value={filters.sort ?? 'created'} options={USER_SORTS} labels={USERS_COPY.sorts} any={false} />
        </Field>
        <div className="col-span-full flex items-center gap-3 xl:col-span-1">
          <Button type="submit" variant="outline">
            {COPY.apply}
          </Button>
          <Link href="/admin/users" className="text-sm text-muted-foreground hover:text-foreground">
            {COPY.reset}
          </Link>
        </div>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">{COPY.dates}</p>
    </form>
  )
}
