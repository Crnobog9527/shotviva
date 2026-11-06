import { Fragment, type ReactNode } from 'react'

// One line icon per "For business" item, in the order DESIGN §6.9 item 8 fixes (comps-v3-b
// pricing.html): invoice, template, batch, API, privacy, contact.
const PATHS: readonly ReactNode[] = [
  <Fragment key="invoice">
    <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
    <path d="M14 4v5h5M9 13h6M9 17h6" />
  </Fragment>,
  <Fragment key="template">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <path d="M3.5 9h17M9 9v11.5" />
  </Fragment>,
  <Fragment key="batch">
    <rect x="3" y="7" width="12" height="12" rx="2" />
    <path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2" />
  </Fragment>,
  <path key="api" d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  <Fragment key="privacy">
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </Fragment>,
  <Fragment key="contact">
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3" />
  </Fragment>,
]

export function BusinessIcon({ index }: { index: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="row-span-2 mt-0.5 size-5 text-primary" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[index] ?? PATHS[0]}
    </svg>
  )
}

export function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] text-primary" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  )
}
