'use client'

import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/core/ui/cn'

import { SECTION_IDS, sectionCopy, sectionNavCopy, type SectionId } from './layout-copy'
import type { OpenSections } from './open-sections'

const anchor = (id: SectionId) => `tpl-section-${id}`

// One collapsible group of editor fields. A closed section keeps its fields mounted (a native
// <details>), so an upload or a loaded history inside it carries on while it is folded.
export function EditorSection({ id, sections, children }: { id: SectionId; sections: OpenSections; children: ReactNode }) {
  const open = sections.open.has(id)
  return (
    <details id={anchor(id)} open={open} onToggle={event => event.currentTarget.open !== open && sections.set(id, event.currentTarget.open)}
      className="group scroll-mt-14 rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
        {sectionCopy[id]}
      </summary>
      <div className="grid gap-4 border-t px-4 pt-4 pb-5">{children}</div>
    </details>
  )
}

// Pinned at the top of the form column: one chip per section (opens it and scrolls to it), and
// open / close all.
export function SectionNav({ sections, shown }: { sections: OpenSections; shown: readonly SectionId[] }) {
  const go = (id: SectionId) => {
    sections.set(id, true)
    requestAnimationFrame(() => document.getElementById(anchor(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  return (
    <nav aria-label={sectionNavCopy.label} className="bg-background/95 sticky top-0 z-10 -mx-6 -mt-2 flex flex-wrap items-center gap-1.5 border-b px-6 py-2 backdrop-blur">
      {SECTION_IDS.filter(id => shown.includes(id)).map(id => (
        <button key={id} type="button" onClick={() => go(id)}
          className={cn('rounded-full border px-2.5 py-1 text-xs', sections.open.has(id) ? 'text-foreground' : 'text-muted-foreground')}>
          {sectionCopy[id]}
        </button>
      ))}
      <span className="ml-auto flex gap-2 text-xs">
        <button type="button" className="text-muted-foreground hover:underline" onClick={() => sections.setAll(true)}>{sectionNavCopy.openAll}</button>
        <button type="button" className="text-muted-foreground hover:underline" onClick={() => sections.setAll(false)}>{sectionNavCopy.closeAll}</button>
      </span>
    </nav>
  )
}
