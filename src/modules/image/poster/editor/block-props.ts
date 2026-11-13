import type { PosterContent } from '@/core/poster'

// What every block editor gets: the content, a change (with the path it touched, which clears
// that path's yellow flag) and whether a path is flagged.
export type BlockProps = {
  content: PosterContent
  onChange(next: PosterContent, path: string): void
  flagged(path: string): boolean
}
