'use client'

import dynamic from 'next/dynamic'
import { Suspense, useEffect, useState, type ReactNode } from 'react'

import { useViewer, ViewerProvider, type ViewerActions } from './viewer-context'
import { ViewerSync } from './viewer-sync'

// The viewer's code (the photo view, the edit and creation forms) stays out of Photos' first
// load (scripts/js-budget.json) and is fetched while the browser is idle, so the first open does
// not wait for it.
const loadViewer = () => import('./work-viewer')
const WorkViewer = dynamic(() => loadViewer().then((m) => m.WorkViewer), { ssr: false })

// In the Photos layout: the viewer's state around both Photos pages, and the viewer itself.
export function ViewerHost({ actions, children }: { actions: ViewerActions; children: ReactNode }) {
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1500))
    idle(() => void loadViewer())
  }, [])
  return (
    <ViewerProvider actions={actions}>
      {children}
      <Suspense fallback={null}>
        <ViewerSync />
        <ViewerGate />
      </Suspense>
    </ViewerProvider>
  )
}

// Mounted from the first open on, so its closing motion can play.
function ViewerGate() {
  const viewer = useViewer()
  const [opened, setOpened] = useState(false)
  if (viewer?.id && !opened) setOpened(true)
  return opened ? <WorkViewer /> : null
}
