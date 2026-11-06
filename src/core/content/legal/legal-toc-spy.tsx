'use client'

import { useEffect } from 'react'

// Two enhancements for the contents lists (legal.html); without JS they are plain anchor lists.
//  1. The section crossing the upper part of the screen gets aria-current in both lists; in the
//     desktop column it is also scrolled into view when the column scrolls on its own.
//  2. The desktop column never slides under the app bar: a sticky box cannot leave its grid row,
//     which ends with the text, so near the end of the page the column's height is capped at the
//     space between its sticky top and the text's bottom edge (--mk-toc-max); it scrolls inside.
export function LegalTocSpy() {
  useEffect(markCurrentSection, [])
  useEffect(fitStickyColumn, [])
  return null
}

function markCurrentSection() {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.mk-legal-toc a[href^="#"]')]
  const sections = [...document.querySelectorAll<HTMLElement>('.mk-legal-text section[id]')]
  if (sections.length === 0 || !('IntersectionObserver' in window)) return
  const column = document.querySelector<HTMLElement>('.mk-legal-toc-side')
  const mark = (id: string) => {
    for (const link of links) {
      if (link.getAttribute('href') !== `#${id}`) {
        link.removeAttribute('aria-current')
        continue
      }
      link.setAttribute('aria-current', 'true')
      if (column?.contains(link)) keepInView(column, link)
    }
  }
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && mark(entry.target.id)), {
    rootMargin: '-20% 0px -70% 0px',
  })
  sections.forEach((section) => observer.observe(section))
  return () => observer.disconnect()
}

// When the desktop column scrolls on its own, the current entry stays visible in it. Only the
// column moves (scrollIntoView would scroll the page too).
function keepInView(column: HTMLElement, link: HTMLElement) {
  const top = link.getBoundingClientRect().top - column.getBoundingClientRect().top + column.scrollTop
  const bottom = top + link.offsetHeight
  if (top < column.scrollTop) column.scrollTop = top - 8
  else if (bottom > column.scrollTop + column.clientHeight) column.scrollTop = bottom - column.clientHeight + 8
}

// Room left below the sticky top before the text ends, minus a 16px gap.
export function tocMaxHeight(stickyTop: number, textBottom: number): number {
  return Math.max(0, Math.floor(textBottom - stickyTop - 16))
}

function fitStickyColumn() {
  const column = document.querySelector<HTMLElement>('.mk-legal-toc-side')
  const text = document.querySelector<HTMLElement>('.mk-legal-text')
  if (!column || !text) return
  let frame = 0
  const fit = () => {
    frame = 0
    // Hidden below 1024px (display: none): nothing to fit.
    if (column.offsetParent === null) return
    const top = parseFloat(getComputedStyle(column).top) || 0
    column.style.setProperty('--mk-toc-max', `${tocMaxHeight(top, text.getBoundingClientRect().bottom)}px`)
    // A shorter column may have hidden the current entry.
    const current = column.querySelector<HTMLElement>('a[aria-current="true"]')
    if (current) keepInView(column, current)
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(fit)
  }
  fit()
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
  }
}
