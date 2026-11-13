// What a click inside the 实时预览 may not do: open the file picker (the file input itself, or a
// label pointing at one), follow a link, or submit. Everything else (switches, choices, the
// series strip, scrolling) runs as in the user's dialog.
const BLOCKED = 'a[href], input[type="file"], button[type="submit"], [data-preview-block]'

type Clicked = { closest(selector: string): unknown }
type LabelLike = { control?: { type?: string } | null; querySelector(selector: string): { type?: string } | null }

// Duck-typed so the rule runs without a DOM in the unit tests.
export function blocksPreviewClick(target: unknown): boolean {
  if (!target || typeof (target as Clicked).closest !== 'function') return false
  const clicked = target as Clicked
  if (clicked.closest(BLOCKED)) return true
  const label = clicked.closest('label') as LabelLike | null
  if (!label) return false
  const control = label.control ?? label.querySelector('input')
  return control?.type === 'file'
}
