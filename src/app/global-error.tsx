'use client'

import { useEffect } from 'react'

import { captureError } from '@/core/analytics/browser'

// Last-resort boundary for errors in the root layout itself; it replaces the whole document.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => captureError(error), [error])
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <button type="button" onClick={reset} className="rounded-md border px-4 py-2 text-sm">
          Try again
        </button>
      </body>
    </html>
  )
}
