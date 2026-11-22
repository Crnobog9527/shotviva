import { describe, expect, it } from 'vitest'

import { presizedPath, presizedPaths, PRESIZED_WIDTHS } from '../../src/core/presized'
import { runBackfill, type BackfillDeps } from './backfill'

const A = 'covers/a/after-0123456789abcdef.webp'
const B = 'covers/b/before-fedcba9876543210.webp'
const C = 'covers/c/poster-00112233445566aa.webp'

function fakeBucket(keys: string[], options: { failOn?: string } = {}) {
  const objects = new Set(keys)
  const lines: string[] = []
  const writes: string[] = []
  const deps: BackfillDeps = {
    async *list(prefix, startAfter) {
      for (const key of [...objects].sort()) if (key.startsWith(prefix) && (!startAfter || key > startAfter)) yield key
    },
    store: { get: async () => new Uint8Array([1]) },
    write: async (key) => {
      if (key === options.failOn) throw new Error('boom')
      writes.push(key)
      for (const path of presizedPaths(key)) objects.add(path)
      return PRESIZED_WIDTHS.length
    },
    log: (line) => lines.push(line),
  }
  return { deps, lines, writes, objects }
}

describe('runBackfill', () => {
  it('only counts in a dry run', async () => {
    const bucket = fakeBucket([A, B, 'covers/a/motion-0123456789abcdef.webp', ...presizedPaths(C), C])
    const counts = await runBackfill(bucket.deps, { write: false })
    expect(counts).toEqual({ listed: 4, eligible: 3, complete: 1, missing: 2, written: 0, files: 0, failed: 0 })
    expect(bucket.writes).toEqual([])
    expect(bucket.lines.join('\n')).toContain(`would write: ${A}`)
  })

  it('writes the missing covers, including one with only some copies, and is a no-op the second time', async () => {
    const bucket = fakeBucket([A, B, presizedPath(B, 128)])
    const first = await runBackfill(bucket.deps, { write: true })
    expect(first).toMatchObject({ missing: 2, written: 2, files: 2 * PRESIZED_WIDTHS.length, failed: 0 })
    const second = await runBackfill(bucket.deps, { write: true })
    expect(second).toMatchObject({ eligible: 2, complete: 2, missing: 0, written: 0 })
  })

  it('counts a cover with only its WebP copies (made before AVIF was added) as missing', async () => {
    const webpOnly = PRESIZED_WIDTHS.map((width) => presizedPath(A, width, 'webp'))
    const counts = await runBackfill(fakeBucket([A, ...webpOnly]).deps, { write: false })
    expect(counts).toMatchObject({ eligible: 1, complete: 0, missing: 1 })
  })

  it('counts a failure and carries on, so a rerun picks it up', async () => {
    const bucket = fakeBucket([A, B], { failOn: A })
    const counts = await runBackfill(bucket.deps, { write: true, concurrency: 1 })
    expect(counts).toMatchObject({ written: 1, failed: 1 })
    expect(bucket.lines.some((line) => line.includes(`failed: ${A}`))).toBe(true)
  })

  it('resumes after a key', async () => {
    const bucket = fakeBucket([A, B, C])
    const counts = await runBackfill(bucket.deps, { write: true, startAfter: A })
    expect(counts.listed).toBe(2)
    expect(bucket.writes.sort()).toEqual([B, C])
  })
})
