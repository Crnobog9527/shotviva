import type { SyntheticEvent } from 'react'

const preventSaveGesture = (event: SyntheticEvent) => event.preventDefault()

export const templateImageGestures = {
  onContextMenu: preventSaveGesture,
  onDragStart: preventSaveGesture,
}

export const templateImageGestureClass = 'select-none [-webkit-touch-callout:none]'
