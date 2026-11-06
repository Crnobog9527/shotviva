import { cn } from '../../ui/cn'

// The "new reply" dot (ARCHITECTURE §10 「站内工单」): safelight, with its words for screen
// readers. `tab` places it on a tab icon like the Photos count; otherwise it sits inline.
export function UnreadDot({ label, tab = false }: { label: string; tab?: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'inline-block size-2.5 shrink-0 rounded-full bg-primary',
          tab && 'absolute top-2 left-[calc(50%+8px)] md:static md:ml-1',
        )}
      />
      <span className="sr-only">{label}</span>
    </>
  )
}
