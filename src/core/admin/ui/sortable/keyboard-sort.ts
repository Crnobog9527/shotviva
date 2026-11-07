import { sortableCopy } from './copy'

// Keyboard reordering (ARCHITECTURE §10 「拖动排序」): with the handle focused, space picks the
// row up, the arrow keys move it, space drops it and Escape puts it back. A pure step function,
// so the whole sequence is unit-tested without a browser.

export type Lifted = { id: string; original: string[]; order: string[] }

export type KeyStep = {
  // Whether the key was ours (the caller then prevents the browser default, e.g. scrolling).
  handled: boolean
  lifted: Lifted | null
  // The new order to save, only when a drop changed it.
  commit?: string[]
  announce?: string
}

export function moveTo(ids: readonly string[], from: number, to: number): string[] {
  const next = [...ids]
  const [item] = next.splice(from, 1)
  if (item === undefined) return next
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item)
  return next
}

const sameOrder = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i])

function drop(lifted: Lifted, label: string): KeyStep {
  const index = lifted.order.indexOf(lifted.id)
  if (sameOrder(lifted.order, lifted.original)) {
    return { handled: true, lifted: null, announce: sortableCopy.unchanged(label) }
  }
  return {
    handled: true,
    lifted: null,
    commit: [...lifted.order],
    announce: sortableCopy.dropped(label, index, lifted.order.length),
  }
}

function move(lifted: Lifted, label: string, by: -1 | 1): KeyStep {
  const from = lifted.order.indexOf(lifted.id)
  const to = from + by
  // At either end the key does nothing but is still ours, so the page does not scroll.
  if (to < 0 || to >= lifted.order.length) return { handled: true, lifted }
  const order = moveTo(lifted.order, from, to)
  return { handled: true, lifted: { ...lifted, order }, announce: sortableCopy.moved(label, to, order.length) }
}

export function cancelLift(lifted: Lifted, label: string): KeyStep {
  const index = lifted.original.indexOf(lifted.id)
  return { handled: true, lifted: null, announce: sortableCopy.cancelled(label, index, lifted.original.length) }
}

// `id` is the row whose handle has focus; `ids` the order on screen before this key.
export function keyboardSort(lifted: Lifted | null, key: string, id: string, ids: readonly string[], label: string): KeyStep {
  const isToggle = key === ' ' || key === 'Enter'
  if (!lifted) {
    if (!isToggle || !ids.includes(id)) return { handled: false, lifted: null }
    const picked: Lifted = { id, original: [...ids], order: [...ids] }
    return { handled: true, lifted: picked, announce: sortableCopy.picked(label, ids.indexOf(id), ids.length) }
  }
  if (isToggle) return drop(lifted, label)
  if (key === 'Escape') return cancelLift(lifted, label)
  if (key === 'ArrowUp') return move(lifted, label, -1)
  if (key === 'ArrowDown') return move(lifted, label, 1)
  // Tab and the rest keep their usual meaning; the list cancels the lift when focus leaves.
  return { handled: false, lifted }
}
