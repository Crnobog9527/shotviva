import { FREE_MAX_EDGE } from '../rules'

// Where the free-work mark goes (Owner 2026-11-22, sample C「中间 12%」). Everything is a share of
// the picture, so the look is the same at any aspect ratio and any size:
//   - "Made with Shotviva" repeated on a grid turned −30° about the centre: font 4% of the width,
//     a row every 20% of the height, a column every 55% of the width;
//   - white at 20% opacity with a faint dark stroke (0.16% of the width, 0.7 × the fill's
//     opacity), except in a full-width band from 31% to 71% of the height, where the same tiles
//     are at 12% so the dish stays easy to see;
//   - the bottom-right label 「仅供演示 · 未授权商用」 / "Demo only · Not licensed for commercial
//     use", its first line 3.2% of the width.
// Pure numbers: visible-mark.ts draws them; the tests check them at several shapes.

export const TILE_FONT_RATIO = 0.04
export const ROW_STEP_RATIO = 0.2
export const COLUMN_STEP_RATIO = 0.55
export const ANGLE_DEGREES = -30
export const TILE_OPACITY = 0.2
export const BAND_OPACITY = 0.12
export const BAND = { top: 0.31, bottom: 0.71 } as const
export const LABEL_FONT_RATIO = 0.032
const LABEL_MAX_WIDTH_RATIO = 0.92
const LABEL_MARGIN_RATIO = 0.025

export { FREE_MAX_EDGE }

export type Size = { width: number; height: number }

// The −30° rotation (y down, as in SVG's rotate(−30)) of a point about the picture's centre.
export function rotateAboutCentre(size: Size, x: number, y: number): { x: number; y: number } {
  const a = (ANGLE_DEGREES * Math.PI) / 180
  const cx = size.width / 2
  const cy = size.height / 2
  const dx = x - cx
  const dy = y - cy
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) }
}

// The baseline-left point of every tile, in picture pixels. The grid runs from −1× to 2× the
// picture in both directions before turning, so the turned grid still covers every corner.
export function tileAnchors(size: Size): { x: number; y: number }[] {
  const rowStep = size.height * ROW_STEP_RATIO
  const columnStep = size.width * COLUMN_STEP_RATIO
  const anchors: { x: number; y: number }[] = []
  for (let y = -size.height; y < size.height * 2; y += rowStep) {
    for (let x = -size.width; x < size.width * 2; x += columnStep) anchors.push(rotateAboutCentre(size, x, y))
  }
  return anchors
}

export const tileFontPx = (size: Size) => size.width * TILE_FONT_RATIO

// The fill opacity of a picture row: the calmer band in the middle, 20% elsewhere.
export function rowOpacity(size: Size, row: number): number {
  return row >= size.height * BAND.top && row < size.height * BAND.bottom ? BAND_OPACITY : TILE_OPACITY
}

// The label's scale (from the bitmap drawn at `font` px) and its top-left corner. Its first line
// is 3.2% of the width, shrunk only if the whole label would pass 92% of the width.
export function labelPlacement(size: Size, bitmap: Size & { font: number }) {
  const wanted = (size.width * LABEL_FONT_RATIO) / bitmap.font
  const scale = Math.min(wanted, (size.width * LABEL_MAX_WIDTH_RATIO) / bitmap.width)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const margin = Math.round(Math.min(size.width, size.height) * LABEL_MARGIN_RATIO)
  return { width, height, left: Math.max(0, size.width - width - margin), top: Math.max(0, size.height - height - margin) }
}

export type SizeRule =
  // Downloads and shared copies: the whole picture, long edge capped.
  | { kind: 'cap' }
  // The gallery: this width (never up), long edge still capped.
  | { kind: 'width'; width: number }
  // Owner lists: the short edge to this (never up), long edge still capped.
  | { kind: 'short-edge'; shortEdge: number }

// The size a free copy is drawn at: never larger than the original, the long edge never past
// FREE_MAX_EDGE, the aspect ratio kept.
export function freeCopySize(original: Size, rule: SizeRule): Size {
  let scale = 1
  if (rule.kind === 'width') scale = Math.min(1, rule.width / original.width)
  if (rule.kind === 'short-edge') scale = Math.min(1, rule.shortEdge / Math.min(original.width, original.height))
  scale = Math.min(scale, FREE_MAX_EDGE / Math.max(original.width, original.height))
  return { width: Math.max(1, Math.round(original.width * scale)), height: Math.max(1, Math.round(original.height * scale)) }
}
