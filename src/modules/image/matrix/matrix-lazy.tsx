'use client'

import dynamic from 'next/dynamic'

import type { MatrixWorkspaceProps } from './matrix-workspace'

// The barrel (index.ts) registers every client component it exports in each app page that
// imports it, so the multi-template workspace comes in through this wrapper: its own chunk,
// loaded on /generate/batch only (scripts/js-budget.json, app routes).
const Workspace = dynamic(() => import('./matrix-workspace').then((m) => m.MatrixWorkspace))

export function MatrixWorkspaceLazy(props: MatrixWorkspaceProps) {
  return <Workspace {...props} />
}
