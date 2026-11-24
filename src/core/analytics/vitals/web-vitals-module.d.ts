// Next ships web-vitals compiled without types (next/web-vitals types its Metric from this path,
// which resolves to nothing). Only what start-vitals.ts uses; payload.ts checks every field anyway.
declare module 'next/dist/compiled/web-vitals' {
  type Report = (metric: { name: unknown; value: unknown; rating: unknown; navigationType?: unknown; navigationURL?: unknown; id?: unknown; navigationId?: unknown }) => void
  export function onCLS(report: Report): void
  export function onLCP(report: Report): void
  export function onINP(report: Report): void
  export function onFCP(report: Report): void
  export function onTTFB(report: Report): void
}
