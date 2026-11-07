'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { createEngine } from './engine'
import type { CelebrationLevel } from './levels'
import { play, type Stage } from './player'
import { scriptFor } from './timeline'

// The purchase celebration (T55, comps-v3-b demo-celebrate.html), loaded only on the return
// page's success state (loader.tsx). Above the plate: the particle canvas, a white flash, and
// for Max a dimmed room and the safelight coming up. Nothing here takes the pointer, so the
// page's buttons work throughout; a click or Escape anywhere skips to the end. When it ends the
// canvas and the layers are removed. The plate itself only gets data attributes that its CSS
// (tiers.css) animates.

type Props = { level: CelebrationLevel }

const layer = 'pointer-events-none fixed inset-0'

export default function Celebration({ level }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const flash = useRef<HTMLDivElement>(null)
  const dim = useRef<HTMLDivElement>(null)
  const safe = useRef<HTMLDivElement>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const plate = document.querySelector<HTMLElement>('[data-return-plate]')
    if (!canvas.current || !plate) return
    const counter = countUp(plate)
    const finish = () => {
      stop()
      engine.destroy()
      counter.restore()
      plate.removeAttribute('data-celebrating')
      for (const el of [dim.current, safe.current]) el?.style.setProperty('opacity', '0')
      window.removeEventListener('pointerdown', finish)
      window.removeEventListener('keydown', onKey)
      window.setTimeout(() => setGone(true), 600)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && finish()
    const engine = createEngine(canvas.current, () => undefined)
    plate.setAttribute('data-celebrating', level === 'pro' || level === 'max' ? 'big' : 'on')
    const stage: Stage = {
      engine,
      rng: Math.random,
      glyph: () => centreOf(plate.querySelector('[data-glyph]')),
      flash: (ms, peak) => pulse(flash.current, ms, peak),
      dim: (opacity) => dim.current?.style.setProperty('opacity', String(opacity)),
      safelight: (on) => safe.current?.style.setProperty('opacity', on ? '1' : '0'),
      thump: () => plate.setAttribute('data-celebrating', 'big'),
      count: (ms, end) => counter.run(ms, end),
    }
    const stop = play(stage, scriptFor(level), finish)
    window.addEventListener('pointerdown', finish, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      stop()
      engine.destroy()
      counter.restore()
      window.removeEventListener('pointerdown', finish)
      window.removeEventListener('keydown', onKey)
    }
  }, [level])

  if (gone) return null
  // On <body>, not inside the plate: the plate's entrance transform and overflow would make
  // these fixed layers its own size and clip the particles to it.
  return createPortal(
    <div aria-hidden="true">
      <div ref={dim} className={`${layer} z-[1] bg-black opacity-0 transition-opacity duration-500`} />
      <div
        ref={safe}
        className="pointer-events-none fixed top-[40%] left-1/2 z-[1] h-[700px] w-[1100px] -translate-1/2 bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--primary)_34%,transparent),transparent_70%)] opacity-0 transition-opacity duration-[1200ms]"
      />
      <canvas ref={canvas} className={`${layer} z-[80] size-full`} />
      <div ref={flash} className={`${layer} z-[81] bg-[#FFF1E6] opacity-0`} />
    </div>,
    document.body,
  )
}

function centreOf(el: Element | null): readonly [number, number] {
  const r = el?.getBoundingClientRect()
  return r ? [r.left + r.width / 2, r.top + r.height / 2] : [window.innerWidth / 2, window.innerHeight / 3]
}

// A white flash that fades over `ms`.
function pulse(el: HTMLDivElement | null, ms: number, peak: number) {
  if (!el) return
  el.style.transition = 'none'
  el.style.opacity = String(peak)
  requestAnimationFrame(() => {
    el.style.transition = `opacity ${ms}ms ease-out`
    el.style.opacity = '0'
  })
}

// "+135" counting up from "+0" with an ease-out, in the page's number format; restore() puts
// the server's text back (skip, unmount).
function countUp(plate: HTMLElement) {
  const el = plate.querySelector<HTMLElement>('[data-celebrate-added]')
  const text = el?.textContent ?? ''
  const to = Number(el?.dataset.celebrateAdded ?? 0)
  const format = new Intl.NumberFormat(document.documentElement.lang || undefined)
  let raf = 0
  return {
    run(ms: number, end: () => void) {
      if (!el || !to) return end()
      const t0 = performance.now()
      const frame = (now: number) => {
        const k = Math.max(0, Math.min(1, (now - t0) / ms))
        el.textContent = `+${format.format(Math.round(to * (1 - Math.pow(1 - k, 3))))}`
        if (k < 1) raf = requestAnimationFrame(frame)
        else end()
      }
      el.textContent = '+0'
      raf = requestAnimationFrame(frame)
    },
    restore() {
      cancelAnimationFrame(raf)
      if (el) el.textContent = text
    },
  }
}
