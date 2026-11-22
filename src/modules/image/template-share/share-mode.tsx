'use client'

import { useState } from 'react'

import { ShareCollectionSheet } from './share-collection-sheet'
import { ShareSelectBar } from './share-select-bar'
import type { ShareSelection } from './share-selection'

// Create's share mode chrome: the bar while picking, and the sheet "Share selected (N)" opens.
export function ShareModeChrome({ selection }: { selection: ShareSelection }) {
  const [sheet, setSheet] = useState(false)
  if (!selection.selecting) return null
  return (
    <>
      {/* Room under the last cards, so the bar never covers them. */}
      <div aria-hidden="true" className="h-36" />
      <ShareSelectBar count={selection.items.length} onShare={() => setSheet(true)} onCancel={selection.stop} />
      <ShareCollectionSheet open={sheet} items={selection.items} onClose={() => setSheet(false)} onDone={() => { setSheet(false); selection.stop() }} />
    </>
  )
}
