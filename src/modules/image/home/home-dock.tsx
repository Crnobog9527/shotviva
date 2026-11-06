'use client'

import { useEffect, useState, type ReactNode, type RefObject } from 'react'

import { CameraIcon } from './home-icons'

type Props = { watch: readonly RefObject<HTMLElement | null>[]; label: ReactNode; onClick(): void }

// The generator's primary, floating, shown only while no generator is on screen and the footer
// is not either (v3-b comp "dock"): the two are never visible together. Taps bring the
// generator back; nothing is charged from here.
export function HomeDock({ watch, label, onClick }: Props) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const footer = document.querySelector('footer')
    const seen = new Map<Element, boolean>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) seen.set(entry.target, entry.isIntersecting)
      const generatorVisible = watch.some((ref) => ref.current && seen.get(ref.current) && ref.current.offsetParent !== null)
      setShow(!generatorVisible && !(footer && seen.get(footer)))
    })
    for (const ref of watch) if (ref.current) observer.observe(ref.current)
    if (footer) observer.observe(footer)
    return () => observer.disconnect()
  }, [watch])
  return (
    <div className={show ? 'mk-dock mk-dock-show' : 'mk-dock'} aria-hidden={!show}>
      <button type="button" className="mk-cta" tabIndex={show ? 0 : -1} onClick={onClick}>
        <CameraIcon />
        <span>{label}</span>
      </button>
    </div>
  )
}
