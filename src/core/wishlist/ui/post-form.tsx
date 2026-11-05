'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cloneElement, useCallback, useState, type ReactElement } from 'react'

import { ActionBar, ActionNotice } from '../../app-shell'
import { buttonVariants } from '../../ui/button'
import { IMAGES_MAX, IMAGES_MIN } from '../rules'
import { DescriptionField } from './description-field'
import { canSubmit, nextSlotId, uploadedKeys, type Slot } from './post-form-state'
import { usePostRequest } from './use-post-request'

// The upload field is passed in as an element: it is the image module's workspace uploader,
// which core may not import (ARCHITECTURE §1). The server page renders it bare; each field
// here clones it with its own key callback.
export type PhotoSlotElement = ReactElement<{ onKeyChange?(key: string | null): void }>

// Request a template (DESIGN §4.7), a flow page: 1–3 reference photos through the workspace
// upload, a description of at most 300 characters, one fixed "Submit".
export function PostForm({ photoSlot }: { photoSlot: PhotoSlotElement }) {
  const t = useTranslations('app.wishlist.new')
  const router = useRouter()
  const [slots, setSlots] = useState<Slot[]>([{ id: 0, key: null }])
  const [description, setDescription] = useState('')
  const post = usePostRequest(() => router.push('/wishlist?sent=1'))

  const setKey = useCallback((id: number, key: string | null) => {
    setSlots((current) => current.map((slot) => (slot.id === id ? { ...slot, key } : slot)))
  }, [])
  const ready = canSubmit(slots, description)

  return (
    <>
      <section aria-labelledby="photos-h" className="grid gap-3 px-4 pt-4">
        <h2 id="photos-h" className="text-headline font-semibold">{t('photosHeading')}</h2>
        <p className="-mt-2 text-caption text-muted-foreground">{t('photosHint', { min: IMAGES_MIN, max: IMAGES_MAX })}</p>
        {slots.map((slot) => (
          <PhotoField key={slot.id} slot={slot} removable={slots.length > 1} photoSlot={photoSlot} onKey={setKey}
            onRemove={() => setSlots((current) => current.filter((other) => other.id !== slot.id))} />
        ))}
        {slots.length < IMAGES_MAX && (
          <button type="button" onClick={() => setSlots((current) => [...current, { id: nextSlotId(current), key: null }])}
            className={buttonVariants({ variant: 'glass', size: 'touch', className: 'justify-self-start' })}>
            {t('addAnother')}
          </button>
        )}
      </section>
      <DescriptionField value={description} onChange={setDescription} />
      <ActionBar>
        {post.error && <ActionNotice>{t(`errors.${post.error}`)}</ActionNotice>}
        <button type="button" disabled={!ready || post.sending} onClick={() => post.send(description.trim(), uploadedKeys(slots))}
          className={buttonVariants({ variant: ready ? 'cta' : 'glass', size: 'cta', className: ready ? undefined : 'w-full rounded-tile text-cta text-muted-foreground' })}>
          {t(post.sending ? 'submitting' : 'submit')}
        </button>
      </ActionBar>
    </>
  )
}

type FieldProps = { slot: Slot; removable: boolean; photoSlot: PhotoSlotElement; onKey(id: number, key: string | null): void; onRemove(): void }

function PhotoField({ slot, removable, photoSlot, onKey, onRemove }: FieldProps) {
  const t = useTranslations('app.wishlist.new')
  const onKeyChange = useCallback((key: string | null) => onKey(slot.id, key), [onKey, slot.id])
  return (
    <div className="grid gap-2">
      {cloneElement(photoSlot, { onKeyChange })}
      {removable && (
        <button type="button" onClick={onRemove} className="press min-h-11 justify-self-end px-2 text-caption font-semibold text-muted-foreground">
          {t('remove')}
        </button>
      )}
    </div>
  )
}
