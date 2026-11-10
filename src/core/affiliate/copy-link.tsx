'use client'

import { useRef, useState } from 'react'

export function CopyLink({ url, copy, copied }: { url: string; copy: string; copied: string }) {
  const [copiedUrl, setCopiedUrl] = useState<string>()
  const field = useRef<HTMLInputElement>(null)
  const done = copiedUrl === url
  return (
    <div className="flex w-full min-w-0 items-stretch gap-2">
      <input
        className="min-h-11 min-w-0 flex-1 truncate rounded-[12px] bg-[var(--wash-faint)] px-3.5 text-base text-foreground shadow-[inset_0_0_0_1px_var(--input)] outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--ring)]"
        ref={field}
        value={url}
        readOnly
        aria-label={copy}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button
        type="button"
        className="min-h-11 shrink-0 rounded-[12px] bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.975] data-[done]:bg-[var(--success)]"
        data-done={done || undefined}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopiedUrl(url)
          } catch {
            setCopiedUrl(undefined)
            field.current?.select()
          }
        }}
      >
        <span aria-live="polite">{done ? copied : copy}</span>
      </button>
    </div>
  )
}
