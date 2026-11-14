'use client'

import { useEffect, useState } from 'react'

import { cn } from './cn'

type Props = {
  // What lands on the clipboard; also what is shown unless `children` says otherwise.
  value: string
  // The button's accessible name ("Copy photo ID") and its brief confirmation ("Copied").
  label: string
  copied: string
  className?: string
  children?: React.ReactNode
}

// A short value (a reference number, an id) that copies itself on a press. The text stays
// selectable; the confirmation is announced politely and fades after two seconds. Labels come
// from the caller, so the admin (Chinese copy.ts) and the app (next-intl) share it.
export function CopyText({ value, label, copied, className, children }: Props) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const timer = window.setTimeout(() => setDone(false), 2000)
    return () => window.clearTimeout(timer)
  }, [done])
  const copy = () => {
    navigator.clipboard?.writeText(value).then(
      () => setDone(true),
      () => setDone(false),
    )
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${label} ${value}`}
      title={label}
      className={cn('inline-flex min-w-0 items-center gap-1.5 rounded-sm font-mono hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none', className)}
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{children ?? value}</span>
      <CopyIcon done={done} />
      <span role="status" className="sr-only">
        {done ? copied : ''}
      </span>
    </button>
  )
}

function CopyIcon({ done }: { done: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-3.5 shrink-0', done ? 'text-success' : 'opacity-60')} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {done ? <path d="M5 12.5 10 17 19 7" /> : <path d="M9 9h10v10H9zM5 15V5h10" />}
    </svg>
  )
}
