import type { PhotoLink, PhotoLinksOutcome } from '../batch/photo-save'

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

// A desktop browser saves each file as its own download. They start one after another, apart,
// so the browser asks once whether this page may download several files and then keeps them all.
export const DOWNLOAD_GAP_MS = 400

type Clicker = (href: string) => void
type Sleep = (ms: number) => Promise<void>

// Each download is its own hidden frame, not a link on the page: a link is a navigation of the
// page itself, and the next one cancels the one before while its route is still answering (it
// signs the file and redirects), so only the last file would arrive. The frame goes once the
// download has had time to start.
const FRAME_LIFE_MS = 60_000
const clickLink: Clicker = (href) => {
  const frame = document.createElement('iframe')
  frame.hidden = true
  frame.src = href
  document.body.append(frame)
  setTimeout(() => frame.remove(), FRAME_LIFE_MS)
}
const wait: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// onStep: how many have started, for the button's line. alive: false stops the run (the bar closed).
export async function downloadEach(jobIds: readonly string[], onStep: (started: number) => void, alive: () => boolean = () => true, click: Clicker = clickLink, sleep: Sleep = wait): Promise<number> {
  let started = 0
  for (const id of jobIds) {
    if (!alive()) break
    if (started > 0) await sleep(DOWNLOAD_GAP_MS)
    click(downloadHref(id))
    started += 1
    onStep(started)
  }
  return started
}
