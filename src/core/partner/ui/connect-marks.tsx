/* eslint-disable @next/next/no-img-element -- a small static brand mark */
import { cn } from '../../ui/cn'

// Graylum's mark and Shotviva's, joined by three dots (B comp connect.html .marks): safelight
// while asking, success once connected. Shotviva's is a placeholder "S." until its app icon exists.
export function ConnectMarks({ connected }: { connected: boolean }) {
  return (
    <div aria-hidden="true" className="mb-5 flex items-center gap-3">
      <img src="/partners/graylum.svg" alt="" width={56} height={56} className="size-14 rounded-[18px] bg-background object-cover" />
      <span className="flex items-center gap-1 text-muted-foreground">
        {[0.5, 0.8, 1].map((opacity, index) => (
          <i
            key={opacity}
            className={cn('block size-1.5 rounded-full bg-current', connected ? 'text-success' : index === 2 && 'text-primary')}
            style={{ opacity: connected ? 1 : opacity }}
          />
        ))}
      </span>
      <span className="grid size-14 place-items-center rounded-[18px] bg-wash font-display text-[28px] leading-none tracking-[-0.02em] shadow-[inset_0_0_0_1px_var(--border)]">
        <span>
          S<i className="text-primary not-italic">.</i>
        </span>
      </span>
    </div>
  )
}
