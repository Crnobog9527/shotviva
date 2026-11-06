/* eslint-disable @next/next/no-img-element -- local object URL of the picked photo, or the result route */
import type { ReactNode } from 'react'

import { cn } from '@/core/ui/cn'

// The stage's print tray (B comp workspace.html .dev, round 14). `developing` plays the
// developer: the photo as a dim negative, a blurred print fading over it, then the sharp print
// clearing from the top down (globals.css dev-neg / dev-blur / dev-clear). The result does not
// exist until the job lands, so the print is the user's own photo coming up. Without
// `developing` it is the still print, or with `negative` the grey negative of a failed one
// ("Not developed"). HUD pills top left and right.
type TrayProps = { src: string | null; developing: boolean; negative?: boolean; hud: [ReactNode, ReactNode?]; className?: string }

export function DevelopTray({ src, developing, negative = false, hud, className }: TrayProps) {
  return (
    <div className={cn('hairline relative isolate overflow-hidden rounded-panel bg-photo-ground', className)}>
      {src && developing ? (
        <>
          <img src={src} alt="" className="dev-neg absolute inset-0 size-full object-cover" />
          <img src={src} alt="" className="dev-blur absolute inset-0 size-full object-cover" />
          <img src={src} alt="" className="dev-clear absolute inset-0 size-full object-cover" />
        </>
      ) : src ? (
        <img src={src} alt="" className={cn('absolute inset-0 size-full object-cover', negative && 'brightness-[.7] contrast-[.85] grayscale')} />
      ) : null}
      <TrayHud hud={hud} />
    </div>
  )
}

export function TrayHud({ hud }: { hud: [ReactNode, ReactNode?] }) {
  return (
    <span className="absolute inset-x-3 top-3 z-2 flex justify-between gap-2">
      <TrayPill>{hud[0]}</TrayPill>
      {hud[1] ? <TrayPill>{hud[1]}</TrayPill> : null}
    </span>
  )
}

export function TrayPill({ children }: { children: ReactNode }) {
  return <span className="frost inline-flex min-h-7 items-center gap-1 rounded-full px-3 text-caption leading-none font-medium text-photo-ink">{children}</span>
}

// One line under the tray (B comp .stage-cap), centred from lg.
export function TrayCaption({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-caption text-muted-foreground lg:text-center">{children}</p>
}

// The page's two columns from lg up (B comp workspace.html .cols): what is happening on the
// left, the tray on the right, sticky under the nav. Below lg the tray comes first, except with
// `messageFirst` (a failure: the message leads, the comp's [data-state=failed] .col-b). `bar`
// (the Action Bar) comes last in the page, so its phone spacer never sits between message and
// tray; from lg it is placed back under the message. `after` follows the message on a phone and
// the bar from lg (done: before/after under Download, so the primary stays in view).
type LayoutProps = { tray: ReactNode; children: ReactNode; labelledBy: string; messageFirst?: boolean; bar?: ReactNode; after?: ReactNode }

export function StageLayout({ tray, children, labelledBy, messageFirst = false, bar, after }: LayoutProps) {
  const stage = <div className={cn('px-(--gutter) lg:sticky lg:top-[72px] lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:px-0 lg:pt-4', messageFirst ? 'pt-4' : 'pt-2')}>{tray}</div>
  const info = <div className={cn('min-w-0 px-(--gutter) lg:col-start-1 lg:row-start-1 lg:px-0 lg:pt-4', messageFirst ? 'pt-2' : 'pt-4')}>{children}</div>
  return (
    <section aria-labelledby={labelledBy} className="lg:grid lg:grid-cols-[minmax(380px,440px)_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-12 lg:px-(--gutter)">
      {messageFirst ? info : stage}
      {messageFirst ? stage : info}
      {after ? <div className="min-w-0 px-(--gutter) lg:col-start-1 lg:row-start-3 lg:px-0">{after}</div> : null}
      {bar ? <div className="min-w-0 px-(--gutter) lg:col-start-1 lg:row-start-2 lg:px-0">{bar}</div> : null}
    </section>
  )
}

// The tray is 5:4 on phones and a 4:5 print that always fits the viewport from lg up.
export const TRAY_SIZE = 'aspect-[5/4] lg:mx-auto lg:aspect-[4/5] lg:w-[min(100%,calc((100dvh-220px)*0.8))]'
