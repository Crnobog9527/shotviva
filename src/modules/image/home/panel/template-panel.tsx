'use client'

import './template-panel.css'

import { useMemo, useState } from 'react'

import { SetCreateDialog, type SetFrame } from '../../workspace/set-create-dialog'
import type { HomeViewer } from '../home-cta'
import { GuestBar } from './guest-bar'
import { panelContext } from './panel-context'
import { panelReturnPath, type OpenPanel } from './panel-request'

type Props = {
  panel: OpenPanel | null
  // null: signed out.
  viewer: HomeViewer | null
  // This page in its language ('/', '/zh', a landing page): where sign-up comes back to.
  pagePath: string
  gift: string
  onClose(): void
}

// The public pages' template panel (Owner 2026-11-25): Create's own creation dialog, set strip and
// form (set-create-dialog.tsx), so a signed-in visitor generates exactly as in Create, through the
// same generation store, credit reservation and job ids. Signed out the photo stays in the browser
// and the primary is the sign-up button. Loaded on first use, with its sheet (template-panel.css).
export function TemplatePanel({ panel, viewer, pagePath, gift, onClose }: Props) {
  const context = panelContext(viewer)
  // The last opener outlives the panel's own state, which empties as it starts closing.
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  if (panel && panel.opener !== opener) setOpener(panel.opener)
  const ref = panel?.ref ?? null
  const frame = useMemo<SetFrame>(() => (viewer ? {} : {
    guest: { bar: (template) => <GuestBar next={panelReturnPath(pagePath, { templateId: template.id, set: ref })} gift={gift} /> },
  }), [viewer, pagePath, ref, gift])
  return <SetCreateDialog set={panel?.set ?? null} startId={panel?.startId} initialFile={panel?.file ?? null} onClose={onClose} frame={frame} returnFocus={() => opener} {...context} />
}
