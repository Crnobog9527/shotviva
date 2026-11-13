'use client'

import { SearchIcon, XIcon } from 'lucide-react'

import { cn } from '@/core/ui/cn'

type Props = {
  value: string
  onChange(value: string): void
  // Placeholder and accessible name; `clear` names the ✕ button.
  label: string
  clear: string
  className?: string
}

// The template search field (home picker and Create): a search input, 16px text so iOS does not
// zoom on focus, a ✕ that clears it and keeps focus in the field. Esc clears it too (the
// browser's own search-input behaviour), before a dialog around it would close.
export function SearchBox({ value, onChange, label, clear, className }: Props) {
  return (
    <div role="search" className={cn('relative', className)}>
      <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || value === '') return
          event.stopPropagation()
          onChange('')
        }}
        placeholder={label}
        aria-label={label}
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        className="hairline h-11 w-full appearance-none rounded-full bg-wash ps-10 pe-11 text-[16px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:shadow-[inset_0_0_0_1.5px_var(--foreground)] [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label={clear}
          onClick={(event) => {
            onChange('')
            ;(event.currentTarget.previousElementSibling as HTMLInputElement | null)?.focus()
          }}
          className="press absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <XIcon aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  )
}
