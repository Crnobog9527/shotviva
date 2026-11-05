// Browser-side helpers for the cover upload: the PUT straight to R2 (bytes never reach a
// function, ARCHITECTURE §8.1) and the MP4 checks the server cannot do cheaply.

import type { CoverTicket } from '../templates/types'

export async function putToStorage(ticket: CoverTicket, body: Blob): Promise<void> {
  const response = await fetch(ticket.putUrl, { method: 'PUT', headers: ticket.headers, body })
  if (!response.ok) throw new Error(`upload failed (${response.status})`)
}

function once(target: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    target.addEventListener(event, () => resolve(), { once: true })
    target.addEventListener('error', () => reject(new Error('video could not be read')), { once: true })
  })
}

// Length and first frame of a local MP4. The frame becomes the poster that cards show before
// the video loads and under reduced motion (DESIGN §4.2).
export async function readVideo(file: File): Promise<{ seconds: number; poster: Blob }> {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    const loaded = once(video, 'loadeddata')
    video.src = url
    await loaded
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const poster = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!poster) throw new Error('first frame could not be captured')
    return { seconds: video.duration, poster }
  } finally {
    URL.revokeObjectURL(url)
  }
}
