import type { PreparedResult } from './prepare-result'

export type ShareMode = { kind: 'loading' } | { kind: 'share'; file: File } | { kind: 'download' }

// The parts of navigator Share needs; injected so the decision is testable outside a browser.
export type FileSharer = { share?: unknown; canShare?: (data?: ShareData) => boolean }

const DOWNLOAD: ShareMode = { kind: 'download' }

// Without both functions (WeChat and other in-app browsers, older desktops) there is no point
// fetching the photo at all.
export function mayShareFiles(sharer: FileSharer | undefined): sharer is Required<FileSharer> {
  return !!sharer && typeof sharer.share === 'function' && typeof sharer.canShare === 'function'
}

// Asked with the real file: iOS and Android answer per type and size, so an early
// canShare() with no files says nothing. Some builds throw instead of answering false.
export function canShareFile(sharer: FileSharer | undefined, file: File): boolean {
  if (!mayShareFiles(sharer)) return false
  try {
    return sharer.canShare({ files: [file] })
  } catch {
    return false
  }
}

// The File carries its real type: a JPEG normally, the original bytes if re-encoding failed.
export function shareFileFor(blob: Blob, name: string): File {
  const type = blob.type || 'image/png'
  const extension = type === 'image/jpeg' ? 'jpg' : type.replace('image/', '')
  return new File([blob], `${name}.${extension}`, { type })
}

// MOBILE_UI_rules §1.8.1 rules 1–2: Share only once the file is in memory and the browser
// says it can hand that exact file to the OS; anything else (fetch blocked, decode failed,
// canShare false) is Download.
export async function resolveShareMode(sharer: FileSharer | undefined, prepared: () => Promise<PreparedResult | null>, name: string): Promise<ShareMode> {
  if (!mayShareFiles(sharer)) return DOWNLOAD
  const result = await prepared().catch(() => null)
  if (!result) return DOWNLOAD
  const file = shareFileFor(result.shareBlob, name)
  return canShareFile(sharer, file) ? { kind: 'share', file } : DOWNLOAD
}
