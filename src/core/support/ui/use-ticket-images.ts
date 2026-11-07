'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { UploadError, type UploadErrorCode } from '../../storage/upload'
import { TICKET_IMAGES_MAX } from '../rules'
import { uploadTicketImage } from './upload-ticket-image'

export type PickedImage = {
  id: string
  preview: string
  status: 'uploading' | 'ready' | 'failed'
  progress: number
  key?: string
  error?: UploadErrorCode
}

type Upload = typeof uploadTicketImage

// The images picked for one message (T69): each uploads on its own as soon as it is picked,
// with progress; removing one cancels its upload. At most TICKET_IMAGES_MAX; extra picks are
// dropped and reported. `busy` holds the send back while one is uploading or has failed.
export function useTicketImages(upload: Upload = uploadTicketImage) {
  const [items, setItems] = useState<PickedImage[]>([])
  const [overflow, setOverflow] = useState(false)
  const uploads = useRef(new Map<string, AbortController>())

  const patch = useCallback((id: string, change: Partial<PickedImage>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)))
  }, [])

  const start = useCallback(
    (file: File) => {
      const id = crypto.randomUUID()
      const controller = new AbortController()
      uploads.current.set(id, controller)
      setItems((current) => [...current, { id, preview: URL.createObjectURL(file), status: 'uploading', progress: 0 }])
      upload(file, (progress) => patch(id, { progress }), controller.signal).then(
        (key) => patch(id, { status: 'ready', key, progress: 1 }),
        (error: unknown) => {
          if (controller.signal.aborted) return
          patch(id, { status: 'failed', error: error instanceof UploadError ? error.code : 'UPLOAD_FAILED' })
        },
      )
    },
    [patch, upload],
  )

  const add = useCallback(
    (files: readonly File[]) => {
      const room = TICKET_IMAGES_MAX - items.length
      setOverflow(files.length > room)
      files.slice(0, Math.max(0, room)).forEach(start)
    },
    [items.length, start],
  )

  const remove = useCallback((id: string) => {
    uploads.current.get(id)?.abort()
    uploads.current.delete(id)
    setOverflow(false)
    setItems((current) => {
      const gone = current.find((item) => item.id === id)
      if (gone) URL.revokeObjectURL(gone.preview)
      return current.filter((item) => item.id !== id)
    })
  }, [])

  // Previews and running uploads end with the field (a sent form remounts it).
  const live = useRef(items)
  useEffect(() => {
    live.current = items
  })
  useEffect(
    () => () => {
      uploads.current.forEach((controller) => controller.abort())
      live.current.forEach((item) => URL.revokeObjectURL(item.preview))
    },
    [],
  )

  const busy = items.some((item) => item.status !== 'ready')
  return { items, add, remove, busy, overflow, full: items.length >= TICKET_IMAGES_MAX }
}
