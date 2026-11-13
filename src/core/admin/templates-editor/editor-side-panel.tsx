'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/core/ui/cn'

import { sidePanelCopy as COPY } from './layout-copy'
import type { PreviewDraft } from './preview-draft'
import { useTemplatePreview, type PreviewLocale, type PreviewWidth } from './preview-slot'

type Mode = 'test' | 'preview'
// The frames the user-facing dialog is drawn at: its desktop size, and a phone.
const FRAME: Record<PreviewWidth, { width: number; height: number }> = { desktop: { width: 1040, height: 760 }, phone: { width: 390, height: 780 } }

// The editor's right panel (Owner 2026-11-13): 试跑 as before, or 实时预览, the real creation
// dialog drawn from the unsaved form. The test run stays mounted while the preview shows, so a
// run in progress keeps going.
export function EditorSidePanel({ testRun, draft, isActive }: { testRun: ReactNode; draft: PreviewDraft | null; isActive: boolean }) {
  const preview = useTemplatePreview()
  const [mode, setMode] = useState<Mode>('test')
  const [width, setWidth] = useState<PreviewWidth>('desktop')
  const [locale, setLocale] = useState<PreviewLocale>('zh')
  if (!preview) return testRun
  return (
    <div className="grid min-w-0 gap-4">
      <Segmented label={COPY.label} value={mode} onChange={setMode} options={[['test', COPY.testRun], ['preview', COPY.preview]]} />
      <div hidden={mode !== 'test'}>{testRun}</div>
      {mode === 'preview' ? (
        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-muted-foreground min-w-0 flex-1 text-xs">{COPY.hint}</p>
            <Segmented label={COPY.widthLabel} value={width} onChange={setWidth} options={[['desktop', COPY.desktop], ['phone', COPY.phone]]} />
            <Segmented label={COPY.localeLabel} value={locale} onChange={setLocale} options={[['zh', COPY.zh], ['en', COPY.en]]} />
          </div>
          {!draft ? <p className="text-muted-foreground text-sm">{COPY.newTemplate}</p> : (
            <>
              {draft.stale ? <p className="text-sm text-amber-600 dark:text-amber-400">{COPY.staleFields}</p> : null}
              {!isActive ? <p className="text-muted-foreground text-xs">{COPY.inactive}</p> : null}
              <ScaledFrame width={width}>
                {preview({ template: draft.template, series: draft.series, width, locale })}
              </ScaledFrame>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

// Draws the frame at its real size and zooms it to the panel's width, so the dialog lays out as
// it does for users. inert: nothing in it can be pressed or focused (no upload, no generate).
function ScaledFrame({ width, children }: { width: PreviewWidth; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState<number | null>(null)
  useEffect(() => {
    const node = box.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setRoom(entry?.contentRect.width ?? null))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const frame = FRAME[width]
  const zoom = room ? Math.min(1, room / frame.width) : 1
  return (
    <div ref={box} className="w-full min-w-0 overflow-hidden">
      <div inert className="bg-popover mx-auto overflow-hidden rounded-2xl border shadow-lg"
        style={{ width: frame.width, height: frame.height, zoom }}>
        {children}
      </div>
    </div>
  )
}

function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: [T, string][] }) {
  return (
    <div role="radiogroup" aria-label={label} className="bg-muted inline-flex w-fit rounded-md p-0.5">
      {options.map(([key, text]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => onChange(key)}
          className={cn('rounded px-3 py-1 text-sm', value === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>
          {text}
        </button>
      ))}
    </div>
  )
}
