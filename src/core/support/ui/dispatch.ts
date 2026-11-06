'use client'

import { startTransition, type FormEvent } from 'react'

// Dispatches a form to its action without React's automatic form reset, so a refused send
// (rate limit, bad input) keeps what was typed. Success redirects or clears the field itself.
export function dispatchKeeping(event: FormEvent<HTMLFormElement>, action: (data: FormData) => void) {
  event.preventDefault()
  const data = new FormData(event.currentTarget)
  startTransition(() => action(data))
}
