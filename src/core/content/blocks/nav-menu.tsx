'use client'

import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Link } from '../../i18n/ui/localized-link'

export type NavMenuLink = { href: `/${string}`; label: string }

// A top-bar disclosure (SEO launch handbook G5: "Use Cases"): a button that shows a short list
// of links. The links are in the server HTML (only `hidden`), so crawlers read them; a click
// outside or Escape closes it. Disclosure, not role="menu": these are plain navigation links.
export function NavMenu({ label, links }: { label: string; links: readonly NavMenuLink[] }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const listId = useId()
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div
      ref={wrap}
      className="mk-navmenu"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        setOpen(false)
        wrap.current?.querySelector<HTMLElement>('button')?.focus()
      }}
    >
      <button type="button" className="mk-nl" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        {label}
        <ChevronDown aria-hidden className="mk-navmenu-chev" strokeWidth={2} />
      </button>
      <ul id={listId} hidden={!open} className="mk-navmenu-list">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
