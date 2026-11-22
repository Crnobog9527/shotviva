import { isPresizableCoverKey, PRESIZED_PREFIX, presizedPaths } from '../../src/core/presized'
import type { ObjectStore } from '../../src/core/storage'

// The pre-sized copies (core/presized) for every cover already in a public bucket, written once
// before NEXT_PUBLIC_PRESIZED_IMAGES_URL is switched on (covers published after the code shipped
// get theirs on upload, core/storage/presized-copies.ts). Idempotent: a cover whose copies are all
// in the bucket is skipped, so a stopped run is resumed by running it again (or from
// --start-after, the last key a progress line printed). A dry run only lists and counts.

export type BackfillDeps = {
  // Every key under a prefix, in the bucket's (lexicographic) order, after `startAfter` if given.
  list(prefix: string, startAfter?: string): AsyncIterable<string>
  store: Pick<ObjectStore, 'get'>
  // Writes all copies of one cover from its bytes; returns how many files it wrote.
  write(key: string, bytes: Uint8Array): Promise<number>
  log(line: string): void
}

export type BackfillOptions = { write: boolean; startAfter?: string; concurrency?: number; progressEvery?: number }

export type BackfillCounts = {
  listed: number
  eligible: number
  complete: number
  missing: number
  written: number
  files: number
  failed: number
}

async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
  const items: string[] = []
  for await (const item of iterable) items.push(item)
  return items
}

// The covers that still lack at least one copy, from two listings (no per-object HEAD requests).
export async function planBackfill(deps: Pick<BackfillDeps, 'list'>, startAfter?: string) {
  const keys = await collect(deps.list('covers/', startAfter))
  const existing = new Set(await collect(deps.list(`${PRESIZED_PREFIX}/`)))
  const eligible = keys.filter(isPresizableCoverKey)
  const missing = eligible.filter((key) => presizedPaths(key).some((path) => !existing.has(path)))
  return { listed: keys.length, eligible: eligible.length, missing }
}

export async function runBackfill(deps: BackfillDeps, options: BackfillOptions): Promise<BackfillCounts> {
  const plan = await planBackfill(deps, options.startAfter)
  const counts: BackfillCounts = { listed: plan.listed, eligible: plan.eligible, complete: plan.eligible - plan.missing.length, missing: plan.missing.length, written: 0, files: 0, failed: 0 }
  deps.log(`covers listed ${counts.listed}, pre-sizable ${counts.eligible}, complete ${counts.complete}, missing copies ${counts.missing}`)
  if (!options.write) {
    for (const key of plan.missing.slice(0, 20)) deps.log(`  would write: ${key}`)
    if (plan.missing.length > 20) deps.log(`  … and ${plan.missing.length - 20} more`)
    return counts
  }
  const queue = [...plan.missing]
  const every = options.progressEvery ?? 25
  let done = 0
  async function worker() {
    for (let key = queue.shift(); key; key = queue.shift()) {
      try {
        const files = await deps.write(key, await deps.store.get(key))
        counts.written += 1
        counts.files += files
      } catch (error) {
        counts.failed += 1
        deps.log(`  failed: ${key} (${error instanceof Error ? error.name : 'error'})`)
      }
      done += 1
      if (done % every === 0) deps.log(`  progress ${done}/${plan.missing.length}, last ${key}`)
    }
  }
  await Promise.all(Array.from({ length: options.concurrency ?? 4 }, worker))
  deps.log(`written ${counts.written} covers (${counts.files} files), failed ${counts.failed}`)
  return counts
}
