'use client'

import { useState, useTransition } from 'react'

import { track, trackUploadError } from '../../analytics/browser'
import { compressImage, putWithProgress, requestTicket, uploadPhoto, type UploadDeps } from '../../storage/upload'
import type { StoreActions, StoreProfile, StoreText } from '../profile'

// The settings card's state (§5.3 店铺信息): read when opened, saved in one call. A new QR code is
// uploaded like any photo as soon as it is picked; saving keeps a copy of it.

type Upload = (file: File) => Promise<string>
export type QrState = { kind: 'kept'; url: string } | { kind: 'new'; url: string; key: string | null; failed?: boolean } | { kind: 'none' }

const qrOf = (profile: StoreProfile): QrState => (profile.hasQr && profile.qrUrl ? { kind: 'kept', url: profile.qrUrl } : { kind: 'none' })

export function useStoreForm(actions: StoreActions, upload: Upload) {
  const [text, setText] = useState<StoreText | null>(null)
  const [qr, setQr] = useState<QrState>({ kind: 'none' })
  const [removed, setRemoved] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed' | 'loadFailed'>('idle')
  const [busy, start] = useTransition()

  const take = (profile: StoreProfile) => { setText(profile); setQr(qrOf(profile)); setRemoved(false) }
  const load = () => start(async () => {
    try { take(await actions.load()) } catch { setStatus('loadFailed') }
  })
  const change = (next: Partial<StoreText>) => { setText((now) => (now ? { ...now, ...next } : now)); setStatus('idle') }

  async function pickQr(file: File) {
    const url = URL.createObjectURL(file)
    setQr({ kind: 'new', url, key: null })
    setStatus('idle')
    try { setQr({ kind: 'new', url, key: await upload(file) }) } catch { setQr({ kind: 'new', url, key: null, failed: true }) }
  }
  const removeQr = () => { setQr({ kind: 'none' }); setRemoved(true); setStatus('idle') }

  const save = () => {
    if (!text) return
    const qrInput = qr.kind === 'new' && qr.key ? qr.key : removed && qr.kind === 'none' ? 'remove' : undefined
    start(async () => {
      try { take(await actions.save({ ...text, ...(qrInput ? { qr: qrInput } : {}) })); setStatus('saved') } catch { setStatus('failed') }
    })
  }
  const uploading = qr.kind === 'new' && !qr.key && !qr.failed
  return { text, qr, status, busy, uploading, load, change, pickQr, removeQr, save }
}

const deps: UploadDeps = { compress: compressImage, requestTicket, put: putWithProgress, track: (props) => track('upload', props), trackError: trackUploadError }

export const uploadStoreQr: Upload = (file) => uploadPhoto(file, deps, { onPhase: () => undefined, onProgress: () => undefined })

export type StoreForm = ReturnType<typeof useStoreForm>
