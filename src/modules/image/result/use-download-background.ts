'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { DEFAULT_DOWNLOAD_BACKGROUND, type DownloadBackground } from '@/core/storage/rules/download-background'

import { offersChoice, readSavedBackground, saveBackground, type WorkFile } from './download-background'
import { useTransparency } from './use-share-file'

// Every choice on the page follows one saved value; `picked` keeps this page's pick when the
// browser will not store it.
const listeners = new Set<() => void>()
let picked: DownloadBackground = DEFAULT_DOWNLOAD_BACKGROUND

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

const storage = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const snapshot = () => readSavedBackground(storage(), picked)
const serverSnapshot = () => DEFAULT_DOWNLOAD_BACKGROUND

// 白底 by default (what the page shows), then the user's last pick on this browser.
export function useDownloadBackground(): [DownloadBackground, (next: DownloadBackground) => void] {
  const background = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const choose = useCallback((next: DownloadBackground) => {
    picked = next
    saveBackground(storage(), next)
    listeners.forEach((listener) => listener())
  }, [])
  return [background, choose]
}

// The choice for one result: null when it is not a cut-out (its record, or for an unknown paid
// work what the browser found), so the photo's 白底 / 透明 chips, the download button, Share and
// the Format row all read the same answer.
export function useCutOutChoice(fileUrl: string, work: WorkFile | undefined): [DownloadBackground | null, (next: DownloadBackground) => void] {
  const [picked, choose] = useDownloadBackground()
  const offered = offersChoice(work, useTransparency(fileUrl))
  return [offered ? picked : null, choose]
}
