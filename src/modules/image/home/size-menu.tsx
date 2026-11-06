'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import type { OutputAspect } from '@/core/templates/output-options'

import { SIZE_OPTIONS, sizeLabel } from '../workspace/workspace-options'
import { CheckIcon, ChevronIcon } from './home-icons'

type Props = { value: OutputAspect; onChange(value: OutputAspect): void; label: string }

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
export function SizeMenu({ value, onChange, label }: Props) {
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
  const current = SIZE_OPTIONS.find((option) => option.id === value)
  return (
    <div className="mk-size" ref={root}>
      <button ref={button} type="button" className="mk-bchip" aria-expanded={open} aria-controls={id} aria-label={t('changeSize', { name: label })} onClick={() => setOpen(!open)}>
        <span className="mk-glyph" aria-hidden>
          {current ? <i style={{ width: current.glyph.w / 2, height: current.glyph.h / 2, borderStyle: current.glyph.dashed ? 'dashed' : 'solid' }} /> : null}
        </span>
        <span className="mk-k">{t('size')}</span>
        <span className="mk-chip-name">{app(`sizes.${value}`)}</span>
        <ChevronIcon />
      </button>
      {open ? (
        <div className="mk-size-list" id={id} role="radiogroup" aria-label={t('size')}>
          {SIZE_OPTIONS.map((option) => (
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
              {sizeLabel(option.id, app)}
              <CheckIcon />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
