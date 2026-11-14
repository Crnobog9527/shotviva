import Link from 'next/link'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Input } from '@/core/ui/input'
import { Button } from '@/core/ui/button'
import { COPY, STATUS } from './copy'
import { href, type Filters } from './query'

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span>{label}</span>
      <Input {...props} />
    </label>
  )
}
export function Select({
  label,
  name,
  values,
  initial,
  labels = STATUS,
  all = false,
}: {
  label: string
  name: string
  values: readonly string[]
  initial?: string
  labels?: Record<string, string>
  all?: boolean
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      <select className="h-9 rounded-md border border-input bg-background px-2" name={name} defaultValue={initial}>
        {all && <option value="">{COPY.all}</option>}
        {values.map((value) => (
          <option key={value} value={value}>
            {labels[value] ?? value}
          </option>
        ))}
      </select>
    </label>
  )
}
export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />
}
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}
export function GridTable({ heads, rows }: { heads: string[]; rows: { key: string; cells: ReactNode[] }[] }) {
  if (!rows.length) return <p className="rounded border border-dashed p-4 text-muted-foreground">{COPY.empty}</p>
  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted">
          <tr>
            {heads.map((h) => (
              <th className="p-3" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t align-top">
              {row.cells.map((cell, i) => (
                <td key={i} className="p-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export function NextPage({ filters, cursor }: { filters: Filters; cursor: string | null }) {
  return (
    cursor && (
      <Link href={href({ ...filters, cursor })} className="text-sm text-primary hover:underline">
        {COPY.next}
      </Link>
    )
  )
}
export function FiltersForm({ tab, children }: { tab: Filters['tab']; children: ReactNode }) {
  return (
    <form action="/admin/affiliates" className="flex flex-wrap items-end gap-3">
      <Hidden name="tab" value={tab} />
      {children}
      <Button type="submit" variant="outline" size="sm">
        {COPY.filter}
      </Button>
    </form>
  )
}
export function LinkTo({ filters, children }: { filters: Filters; children: ReactNode }) {
  return (
    <Link href={href(filters)} className="text-primary hover:underline">
      {children}
    </Link>
  )
}
