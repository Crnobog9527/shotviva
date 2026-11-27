'use client'

import { useEffect, useState } from 'react'

// The value, or null while its promise is on its way (a rejected one stays null: the page's own
// error handling, a redirect to sign-in, takes over). For parts a page streams after its grid.
export function useSettled<T>(value: T | Promise<T>): T | null {
  const [settled, setSettled] = useState<{ from: Promise<T>; value: T } | null>(null)
  useEffect(() => {
    if (!(value instanceof Promise)) return
    let live = true
    value.then((result) => live && setSettled({ from: value, value: result }), () => undefined)
    return () => {
      live = false
    }
  }, [value])
  if (!(value instanceof Promise)) return value
  return settled?.from === value ? settled.value : null
}
