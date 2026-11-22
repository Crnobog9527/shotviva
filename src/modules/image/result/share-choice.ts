// What a tap on the result's 「分享」 does (Owner 2026-11-23: share right from the finished
// result, not only from Photos). file: the phone's share sheet with the photo itself, ready in
// memory (share-mode.ts); link: the Photos 作品集分享 dialog for this one work, which works in
// every browser (copy the link, or the share sheet with the link). A desktop pointer takes the
// link when there is one: a desktop share dialog is less useful than a link to paste.
export type ShareChoice = 'file' | 'link' | null

export function shareChoice({ fileReady, touch, link }: { fileReady: boolean; touch: boolean; link: boolean }): ShareChoice {
  if (fileReady && (touch || !link)) return 'file'
  return link ? 'link' : null
}
