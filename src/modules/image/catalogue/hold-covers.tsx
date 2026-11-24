'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

// A chosen category's shelves put two rows of cards inside the near-screen margin at once, so a
// phone on slow 4G fetched twelve covers together and the first one (the page's largest paint)
// came 0.8 s later than in the old grid (2026-11-25). The covers past the first screen therefore
// wait until the first shelf's own first-screen covers have loaded (or HOLD_MAX_MS, whichever is
// sooner); every other Create view leaves this off.
const Held = createContext(false)
const HOLD_MAX_MS = 8_000

export const useCoversHeld = () => useContext(Held)

const settled = (img: HTMLImageElement) =>
  img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    img.addEventListener('load', () => resolve(), { once: true })
    img.addEventListener('error', () => resolve(), { once: true })
  })

// `first`: wraps the first shelf, whose eager covers the rest wait for.
export function useHoldUntilFirst() {
  const first = useRef<HTMLLIElement>(null)
  const [held, setHeld] = useState(true)
  useEffect(() => {
    if (!held) return
    let live = true
    const release = () => { if (live) setHeld(false) }
    const timer = setTimeout(release, HOLD_MAX_MS)
    const eager = [...(first.current?.querySelectorAll<HTMLImageElement>('img[loading="eager"]') ?? [])]
    void Promise.all(eager.map(settled)).then(release)
    return () => { live = false; clearTimeout(timer) }
  }, [held])
  return { first, held }
}

export const HoldCovers = ({ held, children }: { held: boolean; children?: ReactNode }) => <Held value={held}>{children}</Held>
