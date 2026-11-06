import type { ReactNode } from 'react'

import { cn } from './cn'

export type StateIcon = 'none' | 'heart' | 'receipt' | 'missing' | 'error' | 'offline'

const PATHS: Record<Exclude<StateIcon, 'none'>, ReactNode> = {
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />,
  receipt: (
    <>
      <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M14 4v5h5M9 13h6M9 17h6" />
    </>
  ),
  missing: <path d="M6 6l12 12M18 6L6 18" />,
  error: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v5M12 16h.01" />
    </>
  ),
  offline: <path d="M3 9.5a14 14 0 0 1 18 0M6.5 13a9 9 0 0 1 11 0M10 16.5a4 4 0 0 1 4 0M12 19.5h.01M4 4l16 16" />,
}

// The empty viewfinder: a 72×90 frame with four corner marks and, for some states, an icon.
function Frame({ icon, error }: { icon: StateIcon; error: boolean }) {
  const corner = 'absolute size-3 border-bone-dim'
  return (
    <div aria-hidden className={cn('relative mb-5 h-[90px] w-[72px] rounded-[10px] bg-background', error ? 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--destructive)_40%,transparent)]' : 'shadow-[inset_0_0_0_1px_var(--input)]')}>
      <span className={cn(corner, 'top-2 left-2 rounded-tl-[5px] border-t-[1.5px] border-l-[1.5px]')} />
      <span className={cn(corner, 'top-2 right-2 rounded-tr-[5px] border-t-[1.5px] border-r-[1.5px]')} />
      <span className={cn(corner, 'bottom-2 left-2 rounded-bl-[5px] border-b-[1.5px] border-l-[1.5px]')} />
      <span className={cn(corner, 'right-2 bottom-2 rounded-br-[5px] border-r-[1.5px] border-b-[1.5px]')} />
      {icon === 'none' ? null : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cn('absolute top-1/2 left-1/2 size-[22px] -translate-1/2', error ? 'text-destructive' : 'text-muted-foreground')}>
          {PATHS[icon]}
        </svg>
      )}
    </div>
  )
}

type Props = {
  title: string
  body: ReactNode
  // One button (DESIGN §4.6); only Photos and the empty wishlist wall use the solid primary.
  action?: ReactNode
  // A quiet line under the button ("Still stuck? Write to …").
  more?: ReactNode
  icon?: StateIcon
  tone?: 'empty' | 'error'
  // Photos: the first row of cards ghosts through behind the plate, where the photos will be.
  ghost?: boolean
  className?: string
}

// One component for every empty and error state in the app (design/comps-v3-b/empty.html):
// the empty frame, one bold line, a short explanation, one button.
export function EmptyState({ title, body, action, more, icon = 'none', tone = 'empty', ghost = false, className }: Props) {
  const plate = (
    <div
      className={cn(
        'mx-(--gutter) mt-6 grid justify-items-center rounded-panel bg-card px-4 pt-10 pb-8 text-center shadow-[inset_0_0_0_1px_var(--border),inset_0_1px_0_var(--edge-highlight)] md:mx-auto md:max-w-[560px] md:px-8 md:pt-12 md:pb-10',
        ghost && 'relative z-1 -mt-[120px] shadow-[inset_0_0_0_1px_var(--border),inset_0_1px_0_var(--edge-highlight),0_30px_60px_-30px_rgba(0,0,0,.9)] md:-mt-[220px]',
        !ghost && className,
      )}
    >
      <Frame icon={icon} error={tone === 'error'} />
      <b className="text-headline leading-[1.3] font-semibold tracking-[-0.01em] text-balance">{title}</b>
      <p className="mt-1.5 max-w-[34ch] text-[15px] leading-normal text-pretty text-muted-foreground">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
      {more ? <div className="mt-2.5 text-[15px] text-bone-dim">{more}</div> : null}
    </div>
  )
  if (!ghost) return plate
  return (
    <div className={className}>
      <div aria-hidden className="mx-(--gutter) mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        {[0, 1, 2].map((i) => (
          <i key={i} className={cn('block aspect-[4/5] rounded-control bg-wash-faint shadow-[inset_0_0_0_1px_var(--hairline)]', i === 2 && 'hidden md:block')} />
        ))}
      </div>
      {plate}
    </div>
  )
}

// The state's two button looks: the solid primary and the ghost.
export const STATE_PRIMARY =
  'press inline-flex min-h-13 min-w-[200px] items-center justify-center rounded-control bg-primary px-[22px] text-body font-semibold text-primary-foreground shadow-raised'
export const STATE_GHOST = 'press hairline inline-flex min-h-12 min-w-[200px] items-center justify-center rounded-control bg-wash px-[22px] text-body font-semibold text-foreground'
