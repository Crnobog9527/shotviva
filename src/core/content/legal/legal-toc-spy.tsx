'use client'

import { useEffect } from 'react'

// The contents list follows the reader (legal.html): the section crossing the upper part of the
// screen gets aria-current in both contents lists. Only an enhancement; without it the lists
// are plain anchor links.
export function LegalTocSpy() {
  useEffect(() => {
    const links = [...document.querySelectorAll<HTMLAnchorElement>('.mk-legal-toc a[href^="#"]')]
    const sections = [...document.querySelectorAll<HTMLElement>('.mk-legal-text section[id]')]
    if (sections.length === 0 || !('IntersectionObserver' in window)) return
    const mark = (id: string) => {
      for (const link of links) {
        if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'true')
        else link.removeAttribute('aria-current')
      }
    }
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && mark(entry.target.id)),
      { rootMargin: '-20% 0px -70% 0px' },
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])
  return null
}
