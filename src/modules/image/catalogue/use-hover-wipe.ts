'use client'

import { useEffect, type RefObject } from 'react'

import { useMediaQuery } from '@/core/ui/use-media-query'

import { REDUCED_MOTION } from './use-motion'

// The pair card's change, played (DESIGN §6.9 item 3, B comp create.html): at rest the card is
// the still pair. With a pointer, hovering or focusing it develops the right plate from the
// phone photo into the AI result (a clip-path wipe with a safelight seam on its edge), holds,
// fades back to the phone photo and loops; leaving eases back to rest from wherever it is. On
// touch screens it plays once when the card is 60% in view. A video template plays its loop on
// the right plate instead. Decoration only: nothing depends on it, and under reduced motion it
// never runs. The parts are found by data-wipe inside the card.

const WIPE = 1600
const HOLD = 600
const FADE = 400
const RESET = 300
const BACK = 350
const CYCLE = WIPE + HOLD + FADE + RESET
const WIPE_EASE = 'cubic-bezier(.45,0,.2,1)'
const SHOWN = 'inset(0 0% 0 0)'
const HIDDEN = 'inset(0 100% 0 0)'

type Parts = { ai: HTMLElement; seam: HTMLElement | null; video: HTMLVideoElement | null }

export function useHoverWipe(ref: RefObject<HTMLElement | null>) {
  const reduce = useMediaQuery(REDUCED_MOTION)
  useEffect(() => {
    const root = ref.current
    const ai = root?.querySelector<HTMLElement>('[data-wipe="ai"]')
    if (!root || !ai || reduce) return
    const parts: Parts = {
      ai,
      seam: root.querySelector<HTMLElement>('[data-wipe="seam"]'),
      video: root.querySelector<HTMLVideoElement>('video[data-wipe="video"]'),
    }
    const player = parts.video ? videoPlayer(parts.video) : wipePlayer(parts)
    return window.matchMedia('(hover: hover)').matches ? onHover(root, player) : onceInView(root, player)
  }, [ref, reduce])
}

type Player = { start(loop: boolean): void; stop(): void }

function onHover(root: HTMLElement, player: Player): () => void {
  const start = () => player.start(true)
  const stop = () => player.stop()
  root.addEventListener('pointerenter', start)
  root.addEventListener('pointerleave', stop)
  root.addEventListener('focusin', start)
  root.addEventListener('focusout', stop)
  return () => {
    root.removeEventListener('pointerenter', start)
    root.removeEventListener('pointerleave', stop)
    root.removeEventListener('focusin', start)
    root.removeEventListener('focusout', stop)
    player.stop()
  }
}

function onceInView(root: HTMLElement, player: Player): () => void {
  const io = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return
      io.disconnect()
      player.start(false)
    },
    { threshold: 0.6 },
  )
  io.observe(root)
  return () => {
    io.disconnect()
    player.stop()
  }
}

function wipePlayer({ ai, seam }: Parts): Player {
  let running: Animation[] = []
  const at = (ms: number) => ms / CYCLE
  return {
    start(loop) {
      if (running.length) return
      const options = { duration: loop ? CYCLE : WIPE, iterations: loop ? Infinity : 1 }
      const aiFrames: Keyframe[] = loop
        ? [
            { clipPath: HIDDEN, opacity: 1, easing: WIPE_EASE },
            { clipPath: SHOWN, opacity: 1, offset: at(WIPE) },
            { clipPath: SHOWN, opacity: 1, offset: at(WIPE + HOLD) },
            { clipPath: SHOWN, opacity: 0, offset: at(WIPE + HOLD + FADE) },
            { clipPath: HIDDEN, opacity: 0 },
          ]
        : [{ clipPath: HIDDEN, easing: WIPE_EASE }, { clipPath: SHOWN }]
      const seamFrames: Keyframe[] = [
        { left: '0%', opacity: 1, easing: WIPE_EASE },
        { left: '100%', opacity: 1, offset: loop ? at(WIPE) * 0.97 : 0.97 },
        { left: '100%', opacity: 0, offset: loop ? at(WIPE) : 1 },
        ...(loop ? [{ left: '100%', opacity: 0 }] : []),
      ]
      running = [ai.animate(aiFrames, options), ...(seam ? [seam.animate(seamFrames, options)] : [])]
      if (!loop) Promise.all(running.map((animation) => animation.finished)).then(() => (running = []), () => undefined)
    },
    stop() {
      if (!running.length) return
      // From the frame it is on back to rest; a plain cancel would jump.
      const now = getComputedStyle(ai)
      const from = { clipPath: now.clipPath === 'none' ? SHOWN : now.clipPath, opacity: Number(now.opacity) }
      running.forEach((animation) => animation.cancel())
      running = []
      ai.animate([from, { clipPath: SHOWN, opacity: 1 }], { duration: BACK, easing: 'ease-out' })
    },
  }
}

function videoPlayer(video: HTMLVideoElement): Player {
  const hide = () => video.animate([{ opacity: 1 }, { opacity: 0 }], { duration: BACK, fill: 'forwards' })
  const onEnded = () => hide()
  video.addEventListener('ended', onEnded)
  return {
    start(loop) {
      // The file loads on the first play, never with the page.
      if (!video.getAttribute('src') && video.dataset.src) video.src = video.dataset.src
      video.muted = true
      video.loop = loop
      video.animate([{ opacity: 0 }, { opacity: 1 }], { duration: BACK, fill: 'forwards' })
      video.play().catch(() => hide())
    },
    stop() {
      video.pause()
      hide()
    },
  }
}
