import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

import { isPresizablePublicPicture, PRESIZED_FORMATS, PRESIZED_PUBLIC_DIRS, PRESIZED_WIDTHS, presizedPath, type PresizedFormat } from '../src/core/presized'
import { presizedCopies } from '../src/core/storage/presized-copies'

// The site's own pictures (public/home, public/cases…) as the fixed-width AVIF + WebP files the pages load
// when NEXT_PUBLIC_PRESIZED_IMAGES_URL is on (core/presized). Build products, not committed: each
// build writes them from the pictures it ships, so a new or replaced picture always has its copies.

export type PlannedFile = { source: string; target: string; width: number; format: PresizedFormat }

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
    .flatMap((src) =>
      PRESIZED_WIDTHS.flatMap((width) =>
        PRESIZED_FORMATS.map((format) => ({ source: join(publicDir, src), target: join(publicDir, presizedPath(src.slice(1), width, format)), width, format })),
      ),
    )
}

// A copy already newer than its picture is kept (a second `pnpm dev` costs nothing).
const fresh = (file: PlannedFile) => existsSync(file.target) && statSync(file.target).mtimeMs >= statSync(file.source).mtimeMs

// Encoded copies by the picture's content, kept between builds: Vercel restores .next/cache, so a
// build only encodes pictures that are new or changed (AVIF is slow: ~30 s for all of them).
export const defaultCacheDir = (publicDir: string) => join(publicDir, '..', '.next', 'cache', 'presized')
const hashOf = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

async function cachedCopies(cacheDir: string, source: string, files: PlannedFile[]): Promise<(file: PlannedFile) => string> {
  const dir = join(cacheDir, hashOf(readFileSync(source)))
  const cached = (file: PlannedFile) => join(dir, `${file.width}.${file.format}`)
  if (!files.every((file) => existsSync(cached(file)))) {
    mkdirSync(dir, { recursive: true })
    for (const copy of await presizedCopies(source)) writeFileSync(join(dir, `${copy.width}.${copy.format}`), copy.bytes)
  }
  return cached
}

// One picture's copies, encoded as a cover's are (core/storage/presized-copies.ts).
async function writePicture(cacheDir: string, files: PlannedFile[]): Promise<number> {
  const source = files[0]?.source
  if (!source) return 0
  const cached = await cachedCopies(cacheDir, source, files)
  for (const file of files) {
    mkdirSync(dirname(file.target), { recursive: true })
    copyFileSync(cached(file), file.target)
  }
  return files.length
}

export async function writePublicCopies(publicDir: string, cacheDir = defaultCacheDir(publicDir), concurrency = 8): Promise<{ written: number; kept: number }> {
  const planned = planPublicCopies(publicDir)
  const stale = planned.filter((file) => !fresh(file))
  const bySource = [...Map.groupBy(stale, (file) => file.source).values()]
  let written = 0
  async function worker() {
    for (let files = bySource.shift(); files; files = bySource.shift()) {
      const count = await writePicture(cacheDir, files)
      written += count
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return { written, kept: planned.length - stale.length }
}
