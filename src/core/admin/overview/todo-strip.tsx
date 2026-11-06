import Link from 'next/link'

import { formatBeijing } from '../shell/format'
import { OVERVIEW_COPY } from './copy'
import type { TodoCounts } from './todo'

const COPY = OVERVIEW_COPY.todo
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })

type Item = { key: string; href: `/admin${string}`; label: string; value: string; alert: boolean }

function rate(window: { total: number; failed: number }): string {
  return window.total === 0 ? '—' : `${percent.format(window.failed / window.total)}（${window.failed}/${window.total}）`
}

function items(todo: TodoCounts, wishlist: boolean): Item[] {
  const list: Item[] = [
    { key: 'stuck', href: '/admin/jobs', label: COPY.stuck, value: String(todo.stuckJobs), alert: todo.stuckJobs > 0 },
    { key: 'fail1h', href: '/admin/jobs?status=failed', label: COPY.fail1h, value: rate(todo.failures1h), alert: todo.failures1h.failed > 0 },
    { key: 'fail24h', href: '/admin/jobs?status=failed', label: COPY.fail24h, value: rate(todo.failures24h), alert: false },
    { key: 'issues', href: '/admin/orders', label: COPY.paymentIssues, value: String(todo.paymentIssues), alert: todo.paymentIssues > 0 },
    { key: 'purchase', href: '/admin/orders', label: COPY.lastPurchase, value: formatBeijing(todo.lastPurchaseAt) ?? COPY.never, alert: false },
    { key: 'provider', href: '/admin/providers', label: COPY.provider, value: todo.provider ? `${todo.provider.label} · ${todo.provider.model}` : COPY.noProvider, alert: !todo.provider },
  ]
  if (wishlist) {
    list.splice(3, 0, { key: 'requests', href: '/admin/requests', label: COPY.requests, value: String(todo.pendingRequests), alert: todo.pendingRequests > 0 })
  }
  return list
}

// First row of the overview: what needs the Owner today, each linking to where it is handled.
export function TodoStrip({ todo, wishlist }: { todo: TodoCounts; wishlist: boolean }) {
  return (
    <section className="grid gap-2" aria-label={COPY.title}>
      <h2 className="text-sm font-semibold text-muted-foreground">{COPY.title}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {items(todo, wishlist).map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`rounded-lg border p-3 transition-colors hover:bg-muted/50 ${item.alert ? 'border-destructive/60' : 'border-border'}`}
          >
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className={`mt-1 font-mono text-sm font-semibold [overflow-wrap:anywhere] ${item.alert ? 'text-destructive' : ''}`}>{item.value}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
