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
// so the browser fetching it again for the long press changes nothing.
export const albumSrc = (jobId: string) => `/api/files/${jobId}`

// Works whose download was already noted on this page: once each, however often the view opens.
const NOTED = new Set<string>()

// A work shown full size in the album view is noted as downloaded, once, as the download route
// notes one (the page cannot tell whether the long press followed). Works that load close
// together go in one call. A failed call forgets its works, so showing them again asks again.
export function savedNotes(send: (jobIds: string[]) => Promise<unknown>, waitMs = 800, noted: Set<string> = NOTED) {
  let queue: string[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    const ids = queue
    queue = []
    timer = null
    void send(ids).catch(() => ids.forEach((id) => noted.delete(id)))
  }
  return (jobId: string) => {
    if (noted.has(jobId)) return
    noted.add(jobId)
    queue.push(jobId)
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, waitMs)
  }
}
