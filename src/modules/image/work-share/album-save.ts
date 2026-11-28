import { mayShareFiles, type FileSharer } from '../result/share-mode'

// Where the works picked on Photos are saved to, by what the browser can do.
// - share: a phone that hands files to the OS share sheet, whose Save Image puts them in the
//   photo library.
// - album: a phone that cannot (Huawei's browser, WeChat and other in-app browsers) or whose
//   share sheet refused the files. A download there lands in a Download folder the gallery never
//   shows, so the works are shown full size instead and each is saved with a long press, the one
//   way a page gets a picture into the gallery on those browsers.
// - download: a desktop, one file after another.
export type SaveRoute = 'share' | 'album' | 'download'

// coarsePointer: a touch screen is the main pointer. refused: the share sheet turned the files
// down on this page.
export function saveRoute(coarsePointer: boolean, sharer: FileSharer | undefined, refused = false): SaveRoute {
  if (!coarsePointer) return 'download'
  return mayShareFiles(sharer) && !refused ? 'share' : 'album'
}

// The file as its owner sees it, shown in the page: the same owner check and the same watermark
// rule as the download (core/jobs/job-file.ts), with no attachment header and no download noted,
// so the browser fetching it again for the long press changes nothing. The same address as the
// viewer's fileUrl.
export const albumSrc = (jobId: string) => `/api/files/${jobId}`

// Where the page says that a work was shown full size for a long-press save
// (app/api/files/[jobId]/saved): one download noted, as the download route notes one.
export const savedHref = (fileUrl: string) => `${fileUrl}/saved`

async function postSaved(fileUrl: string): Promise<void> {
  const response = await fetch(savedHref(fileUrl), { method: 'POST', credentials: 'same-origin' })
  if (!response.ok) throw new Error('not noted')
}

// Works already noted on this page, by file address (/api/files/:id): once each, however often
// the album view or the viewer's hold sheet opens, and whichever of the two showed it first.
const NOTED = new Set<string>()

// A work shown full size for a long press is noted as downloaded, once (the page cannot tell
// whether the long press followed). A failed call forgets the work, so showing it again asks
// again.
export function savedNotes(send: (fileUrl: string) => Promise<unknown> = postSaved, noted: Set<string> = NOTED) {
  return (fileUrl: string) => {
    if (noted.has(fileUrl)) return
    noted.add(fileUrl)
    void send(fileUrl).catch(() => noted.delete(fileUrl))
  }
}

// The page's one notebook: the album view and the viewer's hold sheet share it.
export const noteSaved = savedNotes()
