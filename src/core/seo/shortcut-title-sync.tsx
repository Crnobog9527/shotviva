'use client'

import { useEffect } from 'react'

import { holdTitle, usesTitleForShortcut } from './shortcut-title'

function watchHead(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.head, { childList: true, subtree: true, characterData: true })
  return () => observer.disconnect()
}

// Huawei Browser only (shortcut-title.ts): everywhere else this renders nothing and does nothing.
export function ShortcutTitleSync({ name }: { name: string }) {
  useEffect(() => {
    if (!usesTitleForShortcut(navigator.userAgent)) return undefined
    return holdTitle(document, name, watchHead)
  }, [name])
  return null
}
