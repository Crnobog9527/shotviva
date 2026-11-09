'use client'

import { CheckIcon } from 'lucide-react'

import { cn } from '../../ui/cn'
import { FieldNote, LabelText } from './field-parts'

type Props<T extends string> = {
  id: string
  legend: string
  options: readonly T[]
  labels: Record<T, string>
  error: string | null
  optional?: string
  // Multi-choice: the hint after the legend ("Choose any").
  hint?: string
} & ({ multiple: true; value: readonly T[]; onChange(value: T[]): void } | { multiple?: false; value: T | ''; onChange(value: T): void })

// A choice set as chips (DESIGN chip / chip-selected): native radios or checkboxes inside a
// fieldset, visually hidden, so the keyboard and screen readers get the real controls. Chosen
// chips fill with bone; multi-choice chips also show a tick, so the two kinds read differently.
export function ChoiceField<T extends string>(props: Props<T>) {
  const { id, legend, options, labels, error, optional, hint } = props
  const chosen = (option: T) => (props.multiple ? props.value.includes(option) : props.value === option)
  const toggle = (option: T) => {
    if (!props.multiple) return props.onChange(option)
    props.onChange(chosen(option) ? props.value.filter((v) => v !== option) : [...props.value, option])
  }
  const noteId = `${id}-note`
  return (
    <fieldset id={id} tabIndex={-1} aria-invalid={error ? true : undefined} aria-describedby={error ? noteId : undefined} className="grid min-w-0 gap-2.5 outline-none">
      <legend className="mb-2.5 text-label leading-[1.3]">
        <LabelText label={legend} optional={optional} />
        {hint ? <span className="ml-1.5 text-muted-foreground">· {hint}</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option} className="relative">
            <input
              type={props.multiple ? 'checkbox' : 'radio'}
              name={id}
              value={option}
              checked={chosen(option)}
              onChange={() => toggle(option)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'press inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[15px] leading-tight transition-colors duration-150',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
                chosen(option)
                  ? 'bg-foreground font-medium text-background'
                  : cn('bg-wash text-bone-dim shadow-[inset_0_0_0_1px_var(--border)] hover:text-foreground', error && 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--destructive)_55%,transparent)]'),
              )}
            >
              {props.multiple && chosen(option) ? <CheckIcon aria-hidden="true" className="-ml-1 size-4" strokeWidth={2.4} /> : null}
              {labels[option]}
            </span>
          </label>
        ))}
      </div>
      <FieldNote id={noteId} error={error} />
    </fieldset>
  )
}
