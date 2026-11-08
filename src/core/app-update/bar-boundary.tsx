'use client'

import { Component, type ReactNode } from 'react'

type Props = { label: string; children: ReactNode }

// If the banner itself fails to render in a stale tab, the root layout must not fall through to
// global-error (which replaces the whole page): a plain reload button stands in for it (T90).
export class BarBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="fixed inset-x-3 bottom-[calc(var(--sab)+12px)] z-90 mx-auto block min-h-11 max-w-[560px] rounded-tile bg-background px-4 text-label font-semibold text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
      >
        {this.props.label}
      </button>
    )
  }
}
