'use client'

import { useEffect, useState } from 'react'

import { loadResult } from './result-file'
import { resolveShareMode, type ShareMode } from './share-mode'

// Rule 1 of MOBILE_UI_rules §1.8.1: the File is ready before the tap, so the click can call
// navigator.share synchronously (iOS rejects a share after an await).
export function useShareFile(fileUrl: string, name: string): ShareMode {
  const [mode, setMode] = useState<ShareMode>({ kind: 'loading' })
  useEffect(() => {
    let live = true
    void resolveShareMode(navigator, () => loadResult(fileUrl), name).then((next) => live && setMode(next))
    return () => {
      live = false
    }
  }, [fileUrl, name])
  return mode
}

// Whether the result has see-through pixels; false until known and whenever it can't be read.
export function useTransparency(fileUrl: string): boolean {
  const [transparent, setTransparent] = useState(false)
  useEffect(() => {
    let live = true
    void loadResult(fileUrl).then((prepared) => live && setTransparent(prepared?.transparent ?? false))
    return () => {
      live = false
    }
  }, [fileUrl])
  return transparent
}
