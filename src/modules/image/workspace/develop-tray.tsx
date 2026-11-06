/* eslint-disable @next/next/no-img-element -- local object URL of the picked photo, or the result route */
import type { ReactNode } from 'react'

import { cn } from '@/core/ui/cn'

// The stage's print tray (B comp workspace.html .dev, round 14). `developing` plays the
// developer: the photo as a dim negative, a blurred print fading over it, then the sharp print
// clearing from the top down (globals.css dev-neg / dev-blur / dev-clear). The result does not
// exist until the job lands, so the print is the user's own photo coming up. Without
// `developing` it is the still print. HUD pills top left and right.
export function DevelopTray({ src, developing, hud, className }: { src: string | null; developing: boolean; hud: [ReactNode, ReactNode?]; className?: string }) {
  return (
    <div className={cn('hairline relative isolate overflow-hidden rounded-panel bg-photo-ground', className)}>
      {src && developing ? (
        <>
          <img src={src} alt="" className="dev-neg absolute inset-0 size-full object-cover" />
          <img src={src} alt="" className="dev-blur absolute inset-0 size-full object-cover" />
          <img src={src} alt="" className="dev-clear absolute inset-0 size-full object-cover" />
        </>
      ) : src ? (
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : null}
      <span className="absolute inset-x-3 top-3 z-2 flex justify-between gap-2">
        <TrayPill>{hud[0]}</TrayPill>
        {hud[1] ? <TrayPill>{hud[1]}</TrayPill> : null}
      </span>
    </div>
  )
}

export function TrayPill({ children }: { children: ReactNode }) {
  return <span className="frost inline-flex min-h-7 items-center gap-1 rounded-full px-3 text-caption leading-none font-medium text-photo-ink">{children}</span>
}

// The page's two columns from lg up (B comp workspace.html .cols): what is happening on the
// left, the tray on the right, sticky under the nav. Below lg the tray comes first.
export function StageLayout({ tray, children, labelledBy }: { tray: ReactNode; children: ReactNode; labelledBy: string }) {
  return (
    <section aria-labelledby={labelledBy} className="lg:grid lg:grid-cols-[minmax(380px,440px)_minmax(0,1fr)] lg:items-start lg:gap-x-12 lg:px-(--gutter)">
      <div className="px-(--gutter) pt-2 lg:sticky lg:top-[72px] lg:order-2 lg:px-0 lg:pt-4">{tray}</div>
      <div className="min-w-0 px-(--gutter) pt-4 lg:order-1 lg:px-0">{children}</div>
    </section>
  )
}

// The tray is 5:4 on phones and a 4:5 print that always fits the viewport from lg up.
export const TRAY_SIZE = 'aspect-[5/4] lg:mx-auto lg:aspect-[4/5] lg:w-[min(100%,calc((100dvh-220px)*0.8))]'
