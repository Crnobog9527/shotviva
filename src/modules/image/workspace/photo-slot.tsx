'use client'

import { useEffect } from 'react'

import { PhotoCard } from './photo-card'
import { PhotoPickers } from './photo-pickers'
import { usePhoto } from './use-photo'

export type PhotoSlotProps = {
  // Called with the uploaded input key once the photo is in R2, and with null while there is
  // no usable upload (nothing picked, still uploading, failed). Optional because a server page
  // renders the bare element and the form that owns it fills this in (cloneElement).
  onKeyChange?(key: string | null): void
}

// One photo field outside the workspace (the wishlist post form): the workspace's own upload
// zone and Compressing → Uploading → Uploaded card, reporting only the finished input key.
export function PhotoSlot({ onKeyChange }: PhotoSlotProps) {
  const photo = usePhoto()
  useEffect(() => onKeyChange?.(photo.inputKey), [photo.inputKey, onKeyChange])
  return photo.photo ? <PhotoCard photo={photo.photo} upload={photo.upload} onPick={photo.pick} /> : <PhotoPickers onPick={photo.pick} />
}
