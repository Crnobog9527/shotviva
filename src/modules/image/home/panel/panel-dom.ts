import { parseSetRef, type BundleInfo, type PanelRequest } from './panel-request'

// The page's cards are server HTML in core/content (建站规格 R5): what a click asks for is in data
// attributes. data-pick-template names the template (a bundle or series card's crossfade keeps it
// on the one on show), data-preview-template a template whose card offers Preview, and
// data-pick-set, on the card or around it, the set it belongs to.
export const PICK_SELECTOR = '[data-pick-template], [data-preview-template]'
export const BUNDLE_KEY_ATTR = 'data-bundle-key'
export const BUNDLE_NAME_ATTR = 'data-bundle-name'

export function requestFromTarget(target: Element): PanelRequest | null {
  const picked = target.closest(PICK_SELECTOR)
  const templateId = picked?.getAttribute('data-pick-template') ?? picked?.getAttribute('data-preview-template')
  if (!picked || !templateId) return null
  return { templateId, set: parseSetRef(picked.closest('[data-pick-set]')?.getAttribute('data-pick-set')) }
}

// A 精选组合 as its card on this page lists it: its name and its live templates, the names under
// the card. Null when the card is not on this page (a landing page, or the bundle is gone).
export function bundleOnPage(key: string): BundleInfo | null {
  const card = [...document.querySelectorAll(`[${BUNDLE_KEY_ATTR}]`)].find((element) => element.getAttribute(BUNDLE_KEY_ATTR) === key)
  if (!card) return null
  const memberIds = [...card.querySelectorAll('.mk-bundle-names [data-pick-template]')].flatMap((chip) => chip.getAttribute('data-pick-template') ?? [])
  return { name: card.getAttribute(BUNDLE_NAME_ATTR) ?? '', memberIds }
}
