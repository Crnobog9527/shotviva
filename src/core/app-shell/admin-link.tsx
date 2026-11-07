import { ShieldCheck } from 'lucide-react'

import type { AdminEntry } from './admin-entry'

// Right end of the desktop top bar (spec #186). The phone tab bar keeps its fixed slots
// (DESIGN §8.2): on phones the account page's Admin row is the way in. A plain link to /admin,
// which has its own shell, so no client code.
export function AdminLink({ entry }: { entry: AdminEntry }) {
  return (
    <a
      href={entry.href}
      data-admin-entry=""
      className="press hidden min-h-10 items-center gap-2 rounded-full px-3.5 text-label leading-none font-medium text-muted-foreground md:ml-auto md:flex md:hover:text-foreground"
    >
      <ShieldCheck aria-hidden className="size-5" strokeWidth={1.75} />
      {entry.label}
    </a>
  )
}
