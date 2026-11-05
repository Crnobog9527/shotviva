'use client'

import { useEffect, useState } from 'react'

import { toJpeg } from './to-jpeg'

export type ShareMode = { kind: 'loading' } | { kind: 'share'; file: File } | { kind: 'download' }

// Rule 1 of MOBILE_UI_rules §1.8.1: fetch the result into a File when the page loads, so the
// click can call navigator.share synchronously (iOS rejects a share after an await). Rule 2:
// without canShare({ files }) (WeChat and other in-app browsers, most desktops) the button is
// "Download" instead.
export function useShareFile(fileUrl: string, name: string): ShareMode {
  const [mode, setMode] = useState<ShareMode>({ kind: 'loading' })
  useEffect(() => {
    let live = true
    const supported = typeof navigator.canShare === 'function'
    const load = async (): Promise<ShareMode> => {
      if (!supported) return { kind: 'download' }
      const response = await fetch(fileUrl)
      if (!response.ok) return { kind: 'download' }
      const file = new File([await toJpeg(await response.blob())], `${name}.jpg`, { type: 'image/jpeg' })
      return navigator.canShare({ files: [file] }) ? { kind: 'share', file } : { kind: 'download' }
    }
    load()
      .catch((): ShareMode => ({ kind: 'download' }))
      .then((next) => live && setMode(next))
    return () => {
      live = false
    }
  }, [fileUrl, name])
  return mode
}
