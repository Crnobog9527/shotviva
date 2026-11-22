import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

import { isPresizablePublicPicture, PRESIZED_PUBLIC_DIRS, PRESIZED_WIDTHS, presizedPath } from '../src/core/presized'
import { presizedCopies } from '../src/core/storage/presized-copies'

// The site's own pictures (public/home, public/cases…) as the fixed-width WebP files the pages load
// when NEXT_PUBLIC_PRESIZED_IMAGES_URL is on (core/presized). Build products, not committed: each
// build writes them from the pictures it ships, so a new or replaced picture always has its copies.

export type PlannedFile = { source: string; target: string; width: number }

function picturesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? picturesUnder(path) : [path]
  })
}

// Every (picture, width) pair, as paths under `publicDir`. Files the pages would not pre-size
// (svg, odd names) are left out, so the build and the pages agree on which pictures have copies.
export function planPublicCopies(publicDir: string): PlannedFile[] {
  return PRESIZED_PUBLIC_DIRS.flatMap((dir) => picturesUnder(join(publicDir, dir)))
    .map((path) => `/${relative(publicDir, path).split(sep).join('/')}`)
    .filter(isPresizablePublicPicture)
    .flatMap((src) => PRESIZED_WIDTHS.map((width) => ({ source: join(publicDir, src), target: join(publicDir, presizedPath(src.slice(1), width)), width })))
}

// A copy already newer than its picture is kept (a second `pnpm dev` costs nothing).
const fresh = (file: PlannedFile) => existsSync(file.target) && statSync(file.target).mtimeMs >= statSync(file.source).mtimeMs

// One picture's copies, encoded as a cover's are (core/storage/presized-copies.ts).
async function writePicture(files: PlannedFile[]): Promise<number> {
  const source = files[0]?.source
  if (!source) return 0
  const copies = new Map((await presizedCopies(source)).map((copy) => [copy.width, copy.bytes]))
  for (const file of files) {
    mkdirSync(dirname(file.target), { recursive: true })
    writeFileSync(file.target, copies.get(file.width) as Uint8Array)
  }
  return files.length
}

export async function writePublicCopies(publicDir: string, concurrency = 8): Promise<{ written: number; kept: number }> {
  const planned = planPublicCopies(publicDir)
  const stale = planned.filter((file) => !fresh(file))
  const bySource = [...Map.groupBy(stale, (file) => file.source).values()]
  let written = 0
  async function worker() {
    for (let files = bySource.shift(); files; files = bySource.shift()) {
      const count = await writePicture(files)
      written += count
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return { written, kept: planned.length - stale.length }
}
