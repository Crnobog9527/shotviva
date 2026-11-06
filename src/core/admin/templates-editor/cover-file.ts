'use client'

import { useEffect, useState } from 'react'

// What the cover card says about the stored file: its name from the public URL and its size
// from a HEAD request (covers are served from the site's own /assets, T51). Size stays unknown
// when the HEAD fails or the server sends no length.

export function coverFileName(url: string): string {
  const path = url.split(/[?#]/)[0] ?? ''
  const last = path.slice(path.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(last) || url
  } catch {
    return last || url
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function useFileSize(url: string | null): number | null {
  const [size, setSize] = useState<{ url: string; bytes: number | null } | null>(null)
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    fetch(url, { method: 'HEAD', signal: controller.signal })
      .then((response) => {
        const length = Number(response.headers.get('content-length'))
        setSize({ url, bytes: response.ok && length > 0 ? length : null })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [url])
  return size && size.url === url ? size.bytes : null
}
