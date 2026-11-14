'use client'

import { useFormatter } from 'next-intl'
import { useState } from 'react'

import { Textarea } from '../../ui/textarea'
import { BODY_MAX } from '../rules'

type Props = { id: string; label: string; placeholder?: string; counter: (count: string, max: string) => string }

// The message field (DESIGN "Inputs / Fields"): 16px text, a mono counter below, at most
// 2,000 characters. Uncontrolled for the form post; the counter follows what is typed.
export function BodyField({ id, label, placeholder, counter }: Props) {
  const format = useFormatter()
  const [length, setLength] = useState(0)
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-headline font-semibold">
        {label}
      </label>
      <Textarea
        id={id}
        name="body"
        required
        maxLength={BODY_MAX}
        rows={6}
        placeholder={placeholder}
        aria-describedby={`${id}-count`}
        onChange={(event) => setLength(event.target.value.length)}
        className="min-h-36 rounded-control text-body"
      />
      <p id={`${id}-count`} className="justify-self-end font-mono text-caption text-muted-foreground">
        {counter(format.number(length), format.number(BODY_MAX))}
      </p>
    </div>
  )
}
