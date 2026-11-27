import { useId, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

// The highlighted surface an org's links sit on: the staff-only link in the owner's workspace
// and a member's own promotion link on /account (Owner 2026-11-23: the same treatment for both).
export function LinkCallout({ icon: Icon, title, hint, children }: { icon: LucideIcon; title: string; hint: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="rounded-panel bg-[var(--caution-tint)] p-4 shadow-[inset_0_0_0_1px_var(--caution-edge)]">
      <h2 id={id} className="flex items-center gap-2 text-headline leading-[1.2] font-semibold tracking-[-0.01em]">
        <Icon aria-hidden strokeWidth={1.75} className="size-5 shrink-0 text-[var(--caution)]" />{title}
      </h2>
      <p className="mt-1 text-label text-bone-dim">{hint}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}
