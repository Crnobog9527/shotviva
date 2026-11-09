'use client'

import { useEffect, useState } from 'react'
import { naturalSize } from './photo-ratio'

export function useOriginalRatio(url: string | null) {
  const [photo, setPhoto] = useState<{ url: string; ratio: number } | null>(null)
  useEffect(() => {
    if (!url) return
    let current = true
    void naturalSize(url).then(({ width, height }) => {
      if (current) setPhoto({ url, ratio: width / height })
    }).catch(() => undefined)
    return () => { current = false }
  }, [url])
  return photo?.url === url ? photo.ratio : null
}
