import type { ProviderInput } from '@/core/jobs'
import type { Resolution } from '@/core/templates'

import { outputTokens, TOKEN_BASE, TOKEN_MODELS } from './output-tokens'

// Output pixel size per resolution tier × ratio (ARCHITECTURE §8.1, DESIGN §4.3). Tiers are
// squares: Standard 1024², HD 2048², Max 2880². Other ratios keep about the same pixel count,
// and every size obeys the model's rules and the pricing rule:
//   - both edges multiples of 16, long:short ≤ 3:1, long edge ≤ 3840, 655,360 ≤ pixels ≤ the
//     tier's square (2880² = 8,294,400 is also the model's pixel cap)
//   - output tokens ≤ the tier's square for every model and quality the calculator knows, so
//     the floor priced on the square (modules/image/credits-floor.ts) holds for any ratio.
// scripts/check-output-sizes.ts prints this table with its token counts and re-proves the rule.

export type OutputSize = { width: number; height: number }

export const TIER_EDGE: Record<Resolution, number> = { '1k': 1024, '2k': 2048, '4k': 2880 }

const STEP = 16
const MAX_EDGE = 3840
const MIN_PIXELS = 655_360
const MAX_RATIO = 3
// A size this close to the asked ratio counts as exact; among those the largest wins.
const RATIO_TOLERANCE = 0.01

// The fixed sizes, as computed by sizeForRatio below (the unit test checks they agree).
export const OUTPUT_SIZES: Record<Resolution, Record<string, string>> = {
  '1k': {
    '1:1': '1024x1024', '16:9': '1360x768', '9:16': '768x1360', '4:5': '912x1136',
    '3:2': '1248x832', '2:3': '832x1248', '4:3': '1184x880', '3:4': '880x1184',
  },
  '2k': {
    '1:1': '2048x2048', '16:9': '2720x1536', '9:16': '1536x2720', '4:5': '1824x2288',
    '3:2': '2496x1664', '2:3': '1664x2496', '4:3': '2352x1760', '3:4': '1760x2352',
  },
  '4k': {
    '1:1': '2880x2880', '16:9': '3840x2160', '9:16': '2160x3840', '4:5': '2576x3216',
    '3:2': '3520x2352', '2:3': '2352x3520', '4:3': '3312x2480', '3:4': '2480x3312',
  },
}

// True when the size costs no more output tokens than the tier's square, on every model and
// quality the official calculator lists.
export function withinSquareTokens(width: number, height: number, edge: number): boolean {
  return TOKEN_MODELS.every((model) =>
    Object.keys(TOKEN_BASE[model]).every(
      (quality) => outputTokens(model, width, height, quality) <= outputTokens(model, edge, edge, quality),
    ),
  )
}

type Candidate = { long: number; short: number; error: number }

function fits(long: number, short: number, edge: number): boolean {
  const pixels = long * short
  return pixels <= edge * edge && pixels >= MIN_PIXELS && long <= MAX_EDGE && long / short <= MAX_RATIO
}

function better(next: Candidate, best: Candidate | null): boolean {
  if (!best) return true
  const nextExact = next.error <= RATIO_TOLERANCE
  const bestExact = best.error <= RATIO_TOLERANCE
  if (nextExact !== bestExact) return nextExact
  if (!nextExact) return next.error < best.error
  const area = next.long * next.short - best.long * best.short
  return area > 0 || (area === 0 && next.error < best.error)
}

// Largest legal size within the tier whose ratio matches `ratio` (width / height, clamped to
// 1:3–3:1). Exhaustive over short edges: at most 180 candidates, cheap per request.
export function sizeForRatio(resolution: Resolution, ratio: number): OutputSize {
  const edge = TIER_EDGE[resolution]
  const target = Math.min(Math.max(ratio >= 1 ? ratio : 1 / ratio, 1), MAX_RATIO)
  if (target === 1) return { width: edge, height: edge }
  let best: Candidate | null = null
  for (let short = STEP; short <= edge; short += STEP) {
    const exact = (short * target) / STEP
    for (const long of new Set([Math.floor(exact), Math.round(exact), Math.ceil(exact)].map((n) => n * STEP))) {
      if (!fits(long, short, edge) || !withinSquareTokens(long, short, edge)) continue
      const candidate = { long, short, error: Math.abs(long / short - target) / target }
      if (better(candidate, best)) best = candidate
    }
  }
  if (!best) return { width: edge, height: edge }
  return ratio >= 1 ? { width: best.long, height: best.short } : { width: best.short, height: best.long }
}

function parseRatio(aspect: string): number {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(aspect)
  const w = Number(match?.[1])
  const h = Number(match?.[2])
  if (!match || w <= 0 || h <= 0) throw new Error(`invalid aspect ratio ${aspect}`)
  if (Math.max(w, h) / Math.min(w, h) > MAX_RATIO) throw new Error(`aspect ratio ${aspect} exceeds 3:1`)
  return w / h
}

function fromTable(text: string): OutputSize {
  const [width, height] = text.split('x').map(Number) as [number, number]
  return { width, height }
}

// `aspect` is a width:height ratio or 'original', which follows the source photo's ratio
// (a square without a photo, e.g. freeform text-only).
export function outputSize(resolution: Resolution, aspect: string, source?: { width?: number; height?: number }): OutputSize {
  if (aspect === 'original') {
    const { width, height } = source ?? {}
    return width && height ? sizeForRatio(resolution, width / height) : sizeForRatio(resolution, 1)
  }
  const fixed = OUTPUT_SIZES[resolution][aspect]
  return fixed ? fromTable(fixed) : sizeForRatio(resolution, parseRatio(aspect))
}

export const sourcePhoto = (input: ProviderInput) => input.photoCount === 0 ? undefined : input.images[0]

export const formatSize = ({ width, height }: OutputSize) => `${width}x${height}`
