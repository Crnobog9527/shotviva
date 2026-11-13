'use client'

import type { CSSProperties, ReactNode, SyntheticEvent } from 'react'

import { blocksPreviewClick } from './preview-guard-rules'

const stop = (event: SyntheticEvent) => {
  event.preventDefault()
  event.stopPropagation()
}

// The 实时预览 frame: everything inside scrolls and responds like the user's dialog, except the
// steps that would upload, open a file picker or navigate away. Captured before the dialog's own
// handlers see them; a programmatic input.click() from the 拍照 / 相册 buttons is caught too,
// since that click bubbles through here and preventDefault keeps the file picker closed.
export function PreviewGuard({ className, style, children }: { className: string; style: CSSProperties; children: ReactNode }) {
  return (
    <div className={className} style={style} data-preview-frame=""
      onClickCapture={event => { if (blocksPreviewClick(event.target)) stop(event) }}
      onDropCapture={stop} onDragOverCapture={stop} onPasteCapture={stop} onSubmitCapture={stop}>
      {children}
    </div>
  )
}
