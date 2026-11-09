'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import type { OutputAspect } from '@/core/templates/output-options'

import type { ImageOptions } from '@/core/templates/image-capabilities'
import { sizeChoices, sizeLabel } from '../workspace/workspace-options'
import { CheckIcon, ChevronIcon } from './home-icons'

type Props = { options: ImageOptions; photoRatio: number | null; value: OutputAspect; onChange(value: OutputAspect): void }

// Closes on a click outside or Escape, and gives focus back to the chip.
function useDismiss(open: boolean, close: () => void) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return root
}

// The bench's Size chip: the workspace's eight sizes (DESIGN §4.3), Original first, as one
// group of radio options above the bar.
export function SizeMenu({ value, onChange, options, photoRatio }: Props) {
  const t = useTranslations('home.generator')
  const app = useTranslations('app')
  const [open, setOpen] = useState(false)
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    button.current?.focus()
  }, [])
  const root = useDismiss(open, close)
  const choices = sizeChoices(options, photoRatio)
  const current = choices.find((option) => option.id === value)
  const label = current?.nearest ? app('sizes.closest', { ratio: current.nearest }) : current ? app(`sizes.${current.id}`) : app('workspace.pickSize')
  return (
    <div className="mk-size" ref={root}>
      <button ref={button} type="button" disabled={!choices.length} className="mk-bchip" aria-expanded={open} aria-controls={id} aria-label={t('changeSize', { name: label })} onClick={() => setOpen(!open)}>
        <span className="mk-glyph" aria-hidden>
          {current ? <i style={{ width: current.glyph.w / 2, height: current.glyph.h / 2, borderStyle: current.glyph.dashed ? 'dashed' : 'solid' }} /> : null}
        </span>
        <span className="mk-k">{t('size')}</span>
        <span className="mk-chip-name">{label}</span>
        <ChevronIcon />
      </button>
      {open ? (
        <div className="mk-size-list" id={id} role="radiogroup" aria-label={t('size')}>
          {choices.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={option.id === value}
              autoFocus={option.id === value}
              onClick={() => {
                onChange(option.id)
                close()
              }}
            >
              {option.nearest ? app('sizes.closest', { ratio: option.nearest }) : sizeLabel(option.id, app)}
              <CheckIcon />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// The stacked home card uses the phone's native picker.
export function MobileSizeMenu({ value, onChange, options, photoRatio }: Props) {
  const t = useTranslations('app')
  const choices = sizeChoices(options, photoRatio)
  const selected = choices.find((choice) => choice.id === value)
  return (
    <label className="mk-field">
      <span className="mk-field-label">{t('workspace.size')}</span>
      <select className="hairline min-h-11 w-full rounded-control bg-card px-3 text-body" disabled={!choices.length}
        value={selected?.nearest ? 'closest' : selected?.id ?? ''} onChange={(event) => onChange(event.target.value === 'closest' ? 'original' : event.target.value as OutputAspect)}>
        {!selected ? <option value="" disabled>{t('workspace.pickSize')}</option> : null}
        {choices.map((choice) => <option key={choice.id} value={choice.nearest ? 'closest' : choice.id}>
          {choice.nearest ? t('sizes.closest', { ratio: choice.nearest }) : sizeLabel(choice.id, t)}
        </option>)}
      </select>
    </label>
  )
}
