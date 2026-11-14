'use client'

import { useEffect, useState } from 'react'

import type { SlotPhotos } from '../workspace/use-photo-batch'

// The poster's QR code upload (ARCHITECTURE §5.3 「二维码」), read in the browser as soon as it is
// picked, so a picture without a readable code is caught here rather than refused on Generate.
// The decoder is fetched only when someone picks a QR code. The server reads it again anyway.
export type QrCheck = 'none' | 'checking' | 'ok' | 'unreadable'

async function readsAsQr(url: string): Promise<boolean> {
  const [{ default: jsQR }, image] = await Promise.all([import('jsqr'), loadImage(url)])
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return true
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  return Boolean(jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' })?.data)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image did not load'))
    image.src = url
  })
}

export function useQrCheck(photos: SlotPhotos, slot: string | null): QrCheck {
  const url = slot ? photos.byKey[slot]?.url ?? null : null
  const [result, setResult] = useState<{ url: string; check: QrCheck } | null>(null)
  useEffect(() => {
    if (!url) return
    let live = true
    // A browser that cannot read the picture leaves the verdict to the server.
    readsAsQr(url).catch(() => true).then((ok) => { if (live) setResult({ url, check: ok ? 'ok' : 'unreadable' }) })
    return () => { live = false }
  }, [url])
  if (!url) return 'none'
  return result?.url === url ? result.check : 'checking'
}
