'use client'

import type { HTMLInputAutoCompleteAttribute, HTMLInputTypeAttribute } from 'react'

import { cn } from '../../ui/cn'
import { CONTROL, FieldNote, LabelText } from './field-parts'

export type TextFieldProps = {
  id: string
  label: string
  value: string
  error: string | null
  onChange(value: string): void
  onBlur(): void
  optional?: string
  placeholder?: string
  hint?: string
  maxLength: number
  input?: { type?: HTMLInputTypeAttribute; autoComplete?: HTMLInputAutoCompleteAttribute; inputMode?: 'email' | 'tel' | 'url' | 'text' }
  // The message box: a textarea with a counter on the right of the note line.
  counter?: string
}

function ariaFor(error: string | null, hint: boolean, optional: boolean, noteId: string) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-required': optional ? undefined : true,
    'aria-describedby': error || hint ? noteId : undefined,
  } as const
}

// One text field of the inquiry form, controlled so the error can show on blur and on send.
// Text renders at 16px so iOS never zooms (DESIGN "The 16px Input Rule").
export function TextField(props: TextFieldProps) {
  const { id, label, value, error, onChange, onBlur, optional, placeholder, hint, maxLength, input, counter } = props
  const noteId = `${id}-note`
  // The browser counts UTF-16 units, so its cap is doubled: it only stops a runaway paste and never
  // cuts an answer the limit (counted in characters, validate.ts) allows; "too long" says the rest.
  const shared = { id, value, placeholder, maxLength: maxLength * 2, onBlur, ...ariaFor(error, Boolean(hint), Boolean(optional), noteId) }
  return (
    <div className="grid content-start gap-2">
      <label htmlFor={id} className="text-label leading-[1.3]">
        <LabelText label={label} optional={optional} />
      </label>
      {counter !== undefined ? (
        <textarea
          {...shared}
          rows={5}
          enterKeyHint="enter"
          autoCapitalize="sentences"
          onChange={(event) => onChange(event.target.value)}
          className={cn(CONTROL, 'min-h-36 resize-none py-3 leading-normal [field-sizing:content]')}
        />
      ) : (
        <input
          {...shared}
          type={input?.type ?? 'text'}
          autoComplete={input?.autoComplete}
          inputMode={input?.inputMode}
          enterKeyHint="next"
          onChange={(event) => onChange(event.target.value)}
          className={cn(CONTROL, 'h-[52px]')}
        />
      )}
      <FieldNote
        id={noteId}
        error={error}
        hint={hint}
        aside={counter !== undefined ? <span className="ml-auto flex-none font-mono text-caption text-muted-foreground">{counter}</span> : undefined}
      />
    </div>
  )
}
