'use client'

import { useEffect, useState } from 'react'

import { loadResult } from './result-file'
import { resolveShareMode, type ShareMode } from './share-mode'

const LOADING: ShareMode = { kind: 'loading' }

// Rule 1 of MOBILE_UI_rules §1.8.1: the File is ready before the tap, so the click can call
// navigator.share synchronously (iOS rejects a share after an await). source: the file to read
// (shareSource); keepAlpha: hand over its PNG rather than the JPEG on white (透明底). A change of
// either is loading again until that file is ready, never the previous choice's file.
export function useShareFile(source: string, name: string, keepAlpha = false): ShareMode {
  const key = `${source} ${name} ${keepAlpha}`
  const [state, setState] = useState<{ key: string; mode: ShareMode }>({ key: '', mode: LOADING })
  useEffect(() => {
    let live = true
    void resolveShareMode(navigator, () => loadResult(source), name, keepAlpha).then((mode) => live && setState({ key, mode }))
    return () => {
      live = false
    }
  }, [key, source, name, keepAlpha])
  return state.key === key ? state.mode : LOADING
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
