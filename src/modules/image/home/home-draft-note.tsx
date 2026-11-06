'use client'

import { useEffect, useState } from 'react'

import { ArrivedNote } from '@/core/auth/ui'

import { loadDraft } from './home-draft'

// On /login and /signup when the visitor came from the home generator: "Your photo and template
// are kept", with the kept photo, read from this browser only (home-draft.ts). Nothing shows when
// the draft is gone or has no photo; the draft itself stays for the home page to bring back.
export function HomeDraftNote({ page }: { page: 'login' | 'signup' }) {
  const [photo, setPhoto] = useState<string | null>(null)
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    void loadDraft().then((found) => {
      if (cancelled || !found?.photo) return
      url = URL.createObjectURL(found.photo)
      setPhoto(url)
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [])
  return photo ? <ArrivedNote kind="home" page={page} image={photo} /> : null
}
