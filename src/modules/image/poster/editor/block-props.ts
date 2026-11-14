import type { PosterContent } from '@/core/poster'

// What every block editor gets: the content, a change (with the path it touched, which clears
// that path's yellow flag) and whether a path is flagged.
export type BlockProps = {
  content: PosterContent
  onChange(next: PosterContent, path: string): void
  flagged(path: string): boolean
  // Still the template's sample text, untouched: drawn greyer until the user types over it.
  sample(path: string): boolean
}

// 清空本块: the part's words gone, and the paths it covered, whose 「待核对」 flags go too.
export type ClearPart = (next: PosterContent, prefixes: readonly string[]) => void
