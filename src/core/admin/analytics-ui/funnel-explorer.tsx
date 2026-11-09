'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'

import { cn } from '../../ui/cn'
import { FUNNEL_DIMS, parseFunnelDim, type FunnelDim } from '../analytics/funnel-options'
import type { FunnelResponse } from '../analytics/funnel-response'
import { ANALYTICS_COPY } from './copy'
import { FunnelView } from './funnel-view'
import { analyticsHref, liveAnalyticsHref, type AnalyticsQuery } from './href'
import { BlockFrame, Unavailable } from './parts'

const COPY = ANALYTICS_COPY.funnel
const groupOf = (dim: FunnelDim) => (dim === 'visitor' ? 'visitor' : 'breakdowns')
type Results = Partial<Record<string, FunnelResponse | null>>
type Props = { query: AnalyticsQuery; initial: FunnelResponse | null; initialEnd: number }

function useFunnel(query: AnalyticsQuery, initial: FunnelResponse | null, initialEnd: number) {
  const [dim, setDim] = useState(query.dim)
  const [end, setEnd] = useState(initialEnd)
  const [results, setResults] = useState<Results>({ [`${initialEnd}-${groupOf(query.dim)}`]: initial })
  const pending = useRef(new Set<string>())
  const [mountedAt] = useState(() => performance.now())

  const choose = useCallback(
    async (next: FunnelDim) => {
      setDim(next)
      const group = groupOf(next)
      // Age the server's window using elapsed time, even on a device with an incorrect clock.
      const epoch = Math.max(end, initialEnd + Math.floor((performance.now() - mountedAt) / 600_000) * 600_000)
      setEnd(epoch)
      const key = `${epoch}-${group}`
      if (results[key] || pending.current.has(key)) return
      pending.current.add(key)
      setResults((all) => ({ ...all, [key]: undefined }))
      const params = new URLSearchParams({ range: query.range, group, end: String(epoch) })
      try {
        const response = await fetch(`/api/admin/analytics/funnel?${params}`, { cache: 'no-store' })
        if (!response.ok) throw new Error('query failed')
        const payload: FunnelResponse = await response.json()
        if (!Number.isSafeInteger(payload.end) || !payload.data[next]) throw new Error('invalid result')
        setResults((all) => ({ ...all, [`${payload.end}-${group}`]: payload }))
        setEnd((current) => Math.max(current, payload.end))
      } catch {
        setResults((all) => ({ ...all, [key]: null }))
      } finally {
        pending.current.delete(key)
      }
    },
    [end, initialEnd, mountedAt, query.range, results],
  )

  useEffect(() => {
    const back = () => void choose(parseFunnelDim(new URL(location.href).searchParams.get('dim')))
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [choose])
  return { dim, choose, result: results[`${end}-${groupOf(dim)}`] }
}

export function FunnelExplorer({ query, initial, initialEnd }: Props) {
  const pathname = usePathname()
  const { dim, choose, result } = useFunnel(query, initial, initialEnd)
  const funnel = result?.data[dim]
  const links = result ? [{ href: result.link, label: ANALYTICS_COPY.openInPostHog }] : []
  function select(event: MouseEvent<HTMLAnchorElement>, next: FunnelDim) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    const url = new URL(event.currentTarget.href)
    url.pathname = location.pathname
    if (location.href !== url.href) window.history.pushState(null, '', url)
    void choose(next)
  }
  return (
    <div id="conversion-funnel" className="scroll-mt-4">
      <BlockFrame title={COPY.title} desc={COPY.desc} links={links}>
        <nav aria-label={COPY.dimLabel} className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
          {FUNNEL_DIMS.map((next) => (
            <a
              key={next}
              href={liveAnalyticsHref(analyticsHref(query, { dim: next }, '#conversion-funnel'), pathname)}
              onClick={(event) => select(event, next)}
              aria-current={next === dim ? 'page' : undefined}
              className={cn(
                'flex min-h-9 items-center rounded px-3 text-sm font-medium',
                next === dim ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {COPY.dims[next]}
            </a>
          ))}
        </nav>
        {funnel ? (
          <div data-funnel-dim={funnel.dim}>
            <FunnelView funnel={funnel} />
          </div>
        ) : result === null ? (
          <div className="grid gap-2">
            <Unavailable />
            <button type="button" className="justify-self-center text-sm text-primary underline" onClick={() => void choose(dim)}>
              {COPY.retry}
            </button>
          </div>
        ) : (
          <div role="status" aria-busy="true" className="p-4 text-sm text-muted-foreground">
            {COPY.loading}
          </div>
        )}
      </BlockFrame>
    </div>
  )
}
