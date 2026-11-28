import { EARLY_TOUCH_SCRIPT, type HomeGeneratorProps } from '@/modules/image/marketing'

import { HomeViewerGate } from './home-viewer-gate'

type Base = Omit<HomeGeneratorProps, 'viewer' | 'settled'>

// The home generator, signed out in the static HTML (建站规格 R5: copy, templates and samples are
// all in it). The visitor half is asked for by the browser, and only when a session cookie is
// there (home-viewer-gate.tsx): the page itself reads nothing at request time, so it prerenders
// fully static and hydrates without waiting for a function.
export function HomeGeneratorSlot(props: Base) {
  return (
    <>
      {/* A card that will swap to a random 精选组合 template notes a touch before hydration, so it
          then stays as the visitor saw it (modules/image/home/early-touch.ts). */}
      {props.shuffle ? <script dangerouslySetInnerHTML={{ __html: EARLY_TOUCH_SCRIPT }} /> : null}
      <HomeViewerGate {...props} />
    </>
  )
}
