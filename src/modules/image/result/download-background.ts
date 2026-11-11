import type { CreditPool } from '@/core/billing/pools'
import { DEFAULT_DOWNLOAD_BACKGROUND, isDownloadBackground, type DownloadBackground } from '@/core/storage/rules/download-background'

// The last 白底 / 透明底 picked, per browser. Only a convenience: without storage (private mode,
// blocked site data) every visit starts on white.
export const BACKGROUND_STORAGE_KEY = 'shotviva:download-bg'

type Store = Pick<Storage, 'getItem' | 'setItem'>

// fallback: this page's own pick when nothing could be saved.
export function readSavedBackground(storage: Store | null | undefined, fallback: DownloadBackground = DEFAULT_DOWNLOAD_BACKGROUND): DownloadBackground {
  try {
    const saved = storage?.getItem(BACKGROUND_STORAGE_KEY)
    return isDownloadBackground(saved) ? saved : fallback
  } catch {
    return fallback
  }
}

export function saveBackground(storage: Store | null | undefined, background: DownloadBackground): void {
  try {
    storage?.setItem(BACKGROUND_STORAGE_KEY, background)
  } catch {
    // Storage full or blocked: the choice still applies to this page.
  }
}

// What the page knows about a result's file: its pool (the watermark) and whether it is a cut-out
// (the server's record; null when unknown).
export type WorkFile = { pool: CreditPool | null; transparent?: boolean | null }

// A cut-out gets the choice. Unknown: a clean work the browser has read and found see-through
// (a free work arrives as a marked JPEG on white, so there is nothing to find).
export function offersChoice(work: WorkFile | undefined, seenTransparent: boolean): boolean {
  if (work?.transparent != null) return work.transparent
  return work?.pool === 'paid' && seenTransparent
}

// The route reads ?bg= only for cut-outs (core/jobs/job-file.ts); a non-cut-out keeps its plain URL.
export function fileHref(fileUrl: string, background: DownloadBackground | null, download: boolean): string {
  const query = new URLSearchParams()
  if (background) query.set('bg', background)
  if (download) query.set('download', '1')
  const tail = query.toString()
  return tail ? `${fileUrl}?${tail}` : fileUrl
}

// Where Share reads its file: the result as shown, except a free cut-out's 透明底, which is a
// separate marked PNG. A paid cut-out's 透明底 is the shown file's own bytes.
export function shareSource(fileUrl: string, work: WorkFile | undefined, background: DownloadBackground | null): string {
  return background === 'transparent' && work?.pool === 'free' ? fileHref(fileUrl, 'transparent', false) : fileUrl
}
