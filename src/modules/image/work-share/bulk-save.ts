import { namedFor, type PhotoLink, type PhotoLinksOutcome } from '../batch/photo-save'

// Saving the works picked on Photos (作品页改版 PR④). Each file is the work's own download route,
// exactly what the viewer's Download gives: the same owner check, the same watermark rule for a
// free work, one recorded download per file (ARCHITECTURE §6.2). No archive is built, so there is
// no tier gate and nothing new on the server.
export const downloadHref = (jobId: string) => `/api/files/${jobId}?download=1`

// For the phone's share sheet. The name's extension is corrected to the bytes once they are
// fetched (a free public work comes back as a JPEG).
export const pickedLinks = (jobIds: readonly string[]): PhotoLink[] => jobIds.map((id) => ({ url: downloadHref(id), name: `shotviva-${id.slice(0, 8)}.png` }))

export const pickedSource = (jobIds: readonly string[]) => async (): Promise<PhotoLinksOutcome> =>
  jobIds.length ? { kind: 'ready', photos: pickedLinks(jobIds) } : { kind: 'error', code: 'NOT_FOUND' }

// A desktop browser saves each file as its own download, one at a time: the page fetches the file
// (the route answers a free work itself and redirects a paid one to storage), then saves the
// bytes through a link to an object URL. Not a hidden frame or a link to the route: the app's
// pages may not be framed (X-Frame-Options), so WebKit never saves an attachment answered inside
// one, and a link navigates the page, where the next download cancels the one still answering.
// Fetching also says whether each file really arrived, so the count is of real downloads.

// The file name the route gave (Content-Disposition), when the browser lets the page read it.
export function nameFrom(disposition: string | null): string | null {
  if (!disposition) return null
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  if (star) {
    try {
      return decodeURIComponent(star[1]!.trim())
    } catch {
      return null
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition)
  return plain ? plain[1]!.trim() : null
}

export type Saved = { name: string; blob: Blob }

// One work's file, named as the route named it, else by its id with the extension its bytes have.
export async function fetchWork(jobId: string, fetcher: typeof fetch = fetch): Promise<Saved | null> {
  try {
    const response = await fetcher(downloadHref(jobId), { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) return null
    const blob = await response.blob()
    const name = nameFrom(response.headers.get('Content-Disposition')) ?? namedFor(`shotviva-${jobId}.png`, blob.type).name
    return { name, blob }
  } catch {
    return null
  }
}

// The object URL outlives the click long enough for the browser to start saving, then goes.
const REVOKE_AFTER_MS = 30_000

export function saveBlob({ name, blob }: Saved): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}

export type DownloadProgress = { saved: number; failed: number }

// One after another, so one file is in memory at a time. onStep: after each work, how many were
// saved and how many could not be fetched. alive: false stops the run (the bar closed).
export async function downloadEach(
  jobIds: readonly string[],
  onStep: (progress: DownloadProgress) => void,
  alive: () => boolean = () => true,
  get: (jobId: string) => Promise<Saved | null> = fetchWork,
  save: (file: Saved) => void = saveBlob,
): Promise<DownloadProgress> {
  const progress: DownloadProgress = { saved: 0, failed: 0 }
  for (const id of jobIds) {
    if (!alive()) break
    const file = await get(id)
    if (!alive()) break
    if (file) {
      save(file)
      progress.saved += 1
    } else {
      progress.failed += 1
    }
    onStep({ ...progress })
  }
  return progress
}
