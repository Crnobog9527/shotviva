'use client'

import { lazy } from 'react'

import type { HomeGeneratorProps } from './home-generator'

const load = async () => ({ default: (await import('./home-generator')).HomeGenerator })

// The server can render the bench immediately. The browser downloads its interactive code
// after the first paint. Input starts it immediately if the visitor is already interacting.
function afterFirstPaint(): Promise<void> {
  return new Promise((resolve) => {
    let frame = 0
    function finish() {
      window.clearTimeout(timeout)
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('pointerdown', finish, true)
      window.removeEventListener('keydown', finish, true)
      resolve()
    }
    const observer = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('paint')
      ? new PerformanceObserver((entries) => {
          if (entries.getEntriesByName('first-contentful-paint').length) finish()
        })
      : undefined
    const timeout = window.setTimeout(finish, 600)
    window.addEventListener('pointerdown', finish, true)
    window.addEventListener('keydown', finish, true)
    if (observer) observer.observe({ type: 'paint', buffered: true })
    else frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(finish) })
  })
}

const ImmediateGenerator = lazy(load)
const AfterPaintGenerator = lazy(async () => {
  if (typeof window !== 'undefined') await afterFirstPaint()
  return load()
})

export function HomeGenerator(props: HomeGeneratorProps) {
  const Generator = props.homePath === '/' || props.homePath === '/zh' ? AfterPaintGenerator : ImmediateGenerator
  return <Generator {...props} />
}
