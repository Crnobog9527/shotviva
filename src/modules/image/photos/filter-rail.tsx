import { Link } from '@/core/i18n/ui'
import { cn } from '@/core/ui/cn'

// One pill of a Photos filter rail. count: how many works it holds, when known. note: a word
// after the label (the company view's "left").
export type RailChip = { key: string; href: string; label: string; here: boolean; count?: number; note?: string }

// A row of pills under "Done" that scrolls sideways on a phone, the chosen one in bone. Each is
// a link, so the filter lives in the address and Back, refresh and Load more keep it.
export function FilterRail({ label, chips }: { label: string; chips: readonly RailChip[] }) {
  return (
    <nav aria-label={label} className="no-scrollbar mt-3 overflow-x-auto px-(--gutter)">
      <ul className="flex gap-2">
        {chips.map((chip) => (
          <li key={chip.key} className="shrink-0">
            <Link
              href={chip.href}
              aria-current={chip.here ? 'page' : undefined}
              className={cn(
                'press inline-flex min-h-9 max-w-[16rem] items-center gap-1.5 rounded-full px-3.5 text-caption font-medium whitespace-nowrap',
                chip.here ? 'bg-foreground text-background' : 'hairline bg-wash text-bone-dim hover:text-foreground',
              )}
            >
              <span className="min-w-0 truncate">{chip.label}</span>
              {chip.note ? <span className="shrink-0 opacity-70">· {chip.note}</span> : null}
              {chip.count === undefined ? null : <span className="shrink-0 tabular-nums opacity-70">{chip.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
