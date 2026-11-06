'use client'

import { useTranslations } from 'next-intl'
import { cloneElement, useCallback, useState, type ReactElement } from 'react'

import { ActionBar, ActionNotice } from '../../app-shell'
import { useRouter } from '../../i18n/navigation'
import { buttonVariants } from '../../ui/button'
import { IMAGES_MAX, IMAGES_MIN } from '../rules'
import { DescriptionField } from './description-field'
import { canSubmit, settleSlots, tilesLeft, uploadedKeys, type Slot } from './post-form-state'
import { usePostRequest } from './use-post-request'

// The photo tile is passed in as an element: it is the image module's uploader, which core may
// not import (ARCHITECTURE §1). The server page renders it bare; the form clones one per tile
// with that tile's callbacks.
export type PhotoTileElement = ReactElement<{
  hint?: string
  onKeyChange?(key: string | null): void
  onPickedChange?(picked: boolean): void
  onRemove?(): void
}>

// Upload limits for the line under the tiles, from the same rules the upload enforces.
export type UploadRules = { formats: string; maxMb: number }

type Props = { photoTile: PhotoTileElement; uploadRules: UploadRules }

// Request a template (B comp wishlist.html ?v=request), a flow page: "What should it look like?",
// up to three reference photo tiles in a row, the look in at most 300 characters, one "Submit"
// fixed at the bottom on phones (DESIGN §4.7). Photos are required, 1–3 (ARCHITECTURE §15.1).
export function PostForm({ photoTile, uploadRules }: Props) {
  const t = useTranslations('app.wishlist.new')
  const router = useRouter()
  const [slots, setSlots] = useState<Slot[]>(() => settleSlots([]))
  const [description, setDescription] = useState('')
  const post = usePostRequest(() => router.push('/wishlist?sent=1'))
  const change = useCallback((id: number, patch: Partial<Slot>) => {
    setSlots((current) => settleSlots(current.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot))))
  }, [])
  const remove = useCallback((id: number) => setSlots((current) => settleSlots(current.filter((slot) => slot.id !== id))), [])
  const ready = canSubmit(slots, description)
  const left = tilesLeft(slots)

  return (
    <>
      <div className="grid gap-5 px-(--gutter) pt-5 md:mx-auto md:max-w-[560px] md:px-0 md:pt-8">
        <div>
          <h1 className="font-display text-[32px] leading-[1.05] tracking-[-0.02em]">{t('heading')}</h1>
          <p className="mt-2 text-[15px] leading-normal text-bone-dim">{t('why')}</p>
        </div>
        <div role="group" aria-label={t('photosLabel', { max: IMAGES_MAX })} className="grid grid-cols-3 gap-2">
          {slots.map((slot) => (
            <TileFor key={slot.id} slot={slot} photoTile={photoTile} hint={t(left === IMAGES_MAX ? 'upTo' : 'left', { count: left })} onChange={change} onRemove={remove} />
          ))}
          {Array.from({ length: IMAGES_MAX - slots.length }, (_, index) => (
            <span key={index} aria-hidden="true" className="viewfinder relative aspect-[4/5] rounded-[14px] bg-background text-bone-dim opacity-60 shadow-[inset_0_0_0_1px_var(--input)] before:inset-2.5" />
          ))}
        </div>
        <p className="-mt-3 text-caption text-muted-foreground">{t('photosHint', { formats: uploadRules.formats, mb: uploadRules.maxMb, min: IMAGES_MIN, max: IMAGES_MAX })}</p>
        <DescriptionField value={description} onChange={setDescription} />
      </div>
      <ActionBar className="md:mx-auto md:max-w-[560px] md:px-0">
        {post.error && <ActionNotice>{t(`errors.${post.error}`)}</ActionNotice>}
        <button type="button" disabled={!ready || post.sending} onClick={() => post.send(description.trim(), uploadedKeys(slots))}
          className={buttonVariants({ variant: 'cta', size: 'cta', className: ready ? undefined : 'opacity-50' })}>
          {t(post.sending ? 'submitting' : 'submit')}
        </button>
      </ActionBar>
    </>
  )
}

type TileProps = { slot: Slot; photoTile: PhotoTileElement; hint: string; onChange(id: number, patch: Partial<Slot>): void; onRemove(id: number): void }

function TileFor({ slot, photoTile, hint, onChange, onRemove }: TileProps) {
  const { id } = slot
  const onKeyChange = useCallback((key: string | null) => onChange(id, { key }), [onChange, id])
  const onPickedChange = useCallback((picked: boolean) => onChange(id, { picked }), [onChange, id])
  const remove = useCallback(() => onRemove(id), [onRemove, id])
  return cloneElement(photoTile, { hint: slot.picked ? undefined : hint, onKeyChange, onPickedChange, onRemove: remove })
}
