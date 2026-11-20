'use client'

import { useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'

import { PhotoSaveButton } from './photo-save-button'
import { phoneSaveSupported } from './photo-save'
import { ZipButton } from './zip-button'

type Props = { batchId: string; count: number; className?: string }

const COARSE = '(pointer: coarse)'
const subscribe = (notify: () => void) => {
  const query = window.matchMedia(COARSE)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}
const phoneSnapshot = () => phoneSaveSupported(window.matchMedia(COARSE).matches, navigator)

// One "save all" entry for a finished batch: on a phone whose browser can share files it saves
// the photos to the photo library; everywhere else (desktop, in-app browsers, or a phone that
// refused) it stays the Download ZIP button.
export function BatchSaveButton(props: Props) {
  const t = useTranslations('app.batchSave')
  const phone = useSyncExternalStore(subscribe, phoneSnapshot, () => false)
  const [refused, setRefused] = useState(false)
  if (phone && !refused) return <PhotoSaveButton {...props} onUnsupported={() => setRefused(true)} />
  return <ZipButton {...props} notice={refused ? t('unsupported') : undefined} />
}
