'use client'

import { useRef, useState } from 'react'

export function CopyLink({ url, copy, copied }: { url: string; copy: string; copied: string }) {
  const [done, setDone] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  return (
    <div className="flex w-full min-w-0 max-w-xl items-center gap-2">
      <input
        className="min-w-0 flex-1 rounded-md border border-input px-3 py-2 text-sm"
        ref={field}
        value={url}
        readOnly
        aria-label={copy}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button
        type="button"
        className="min-h-11 shrink-0 rounded-full bg-primary px-4 font-semibold text-primary-foreground"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setDone(true)
          } catch {
            field.current?.select()
          }
        }}
      >
        {done ? copied : copy}
      </button>
    </div>
  )
}
