import { gzipSync } from 'node:zlib'

// The HTML weight of the home and landing pages against scripts/html-budget.json (PSI P-1, Bing
// "HTML too large", 2026-11-21). Two profiles: `build` is CI's own build, which has no database,
// so it guards everything that does not come from the catalogue (styles, messages, layout, copy);
// `live` is a site with the real catalogue (production, once a day), which guards what grows
// with templates and series.

export type PageBudget = { raw: number; gzip: number }
export type Profile = Record<string, PageBudget>
export type Budget = { note?: string; profiles: Record<string, Profile> }
export type Measured = { path: string; raw: number; gzip: number; budget: PageBudget }

// A desktop browser's request: crawler user agents get a different (uncached) response, and an
// identity encoding gives the bytes the page is, not what the server chose to compress them to.
export const REQUEST_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  'accept-encoding': 'identity',
  accept: 'text/html',
} as const

export function measure(path: string, html: Buffer, budget: PageBudget): Measured {
  return { path, raw: html.length, gzip: gzipSync(html, { level: 9 }).length, budget }
}

export const isOver = (row: Measured) => row.raw > row.budget.raw || row.gzip > row.budget.gzip

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

export function report(rows: readonly Measured[]): string {
  return rows
    .map((row) => {
      const flag = isOver(row) ? 'OVER' : 'ok  '
      return `${flag} ${row.path.padEnd(28)} raw ${kb(row.raw).padStart(9)} / ${kb(row.budget.raw).padStart(9)}   gzip ${kb(row.gzip).padStart(8)} / ${kb(row.budget.gzip).padStart(8)}`
    })
    .join('\n')
}

export function profileOf(budget: Budget, name: string): Profile {
  const profile = budget.profiles[name]
  if (!profile || Object.keys(profile).length === 0) throw new Error(`No pages in html-budget profile "${name}"`)
  return profile
}
