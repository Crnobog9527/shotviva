'use client'

import { useId } from 'react'

import { cn } from '@/core/ui/cn'

import { fieldClass, reveal } from '../../workspace/copy-field-input'

type Props = {
  label: string
  value: string
  onChange(next: string): void
  // Not found in the pasted text (ARCHITECTURE §5.3 逐字校验): shown in yellow until edited.
  flagged?: boolean
  flagNote?: string
  // The template's sample text, not yet edited: greyer (Owner 2026-11-14).
  sample?: boolean
  multiline?: boolean
  maxLength?: number
  inputMode?: 'numeric' | 'tel'
  compact?: boolean
}

const shape = (compact?: boolean, multiline?: boolean) => (compact ? 'h-11 px-3 py-0' : multiline ? 'min-h-[120px]' : 'h-13 py-0')
const boxClass = (compact?: boolean, multiline?: boolean, flagged?: boolean, sample?: boolean) =>
  cn(fieldClass, shape(compact, multiline), sample && 'text-muted-foreground', flagged && 'bg-safelight-tint shadow-[inset_0_0_0_1.5px_var(--primary)]')

// One poster value. 16px text so iOS never zooms; scrolls into view on focus (DESIGN §8.5).
export function PosterField({ label, value, onChange, flagged, flagNote, sample, multiline, maxLength, inputMode, compact }: Props) {
  const id = useId()
  const box = boxClass(compact, multiline, flagged, sample)
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className={cn('text-caption font-medium', compact && 'sr-only')}>{label}</label>
      {multiline ? (
        <textarea id={id} value={value} rows={5} maxLength={maxLength} onFocus={reveal} aria-invalid={flagged || undefined}
          onChange={(event) => onChange(event.target.value)} className={box} />
      ) : (
        <input id={id} value={value} maxLength={maxLength} inputMode={inputMode} onFocus={reveal} autoComplete="off" enterKeyHint="next"
          aria-invalid={flagged || undefined} placeholder={compact ? label : undefined} onChange={(event) => onChange(event.target.value)} className={box} />
      )}
      {flagged && flagNote ? <p className="text-caption text-muted-foreground">{flagNote}</p> : null}
    </div>
  )
}
