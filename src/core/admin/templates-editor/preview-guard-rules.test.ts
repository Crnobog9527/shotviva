import { describe, expect, it } from 'vitest'

import { blocksPreviewClick } from './preview-guard-rules'

// A stand-in element: `matches` lists the selectors its closest() finds, `label` what a label holds.
function el(matches: string[], label?: { control?: { type?: string } | null; input?: { type?: string } | null }) {
  return {
    closest: (selector: string) => {
      if (selector === 'label') return label ? { control: label.control, querySelector: () => label.input ?? null } : null
      return matches.some(match => selector.includes(match)) ? {} : null
    },
  }
}

describe('实时预览 click guard', () => {
  it('lets switches, choices and the series strip through', () => {
    expect(blocksPreviewClick(el([]))).toBe(false)
    expect(blocksPreviewClick(el([], { control: { type: 'checkbox' } }))).toBe(false)
  })

  it('stops the file picker, links, submits and marked controls', () => {
    expect(blocksPreviewClick(el(['input[type="file"]']))).toBe(true)
    expect(blocksPreviewClick(el(['a[href]']))).toBe(true)
    expect(blocksPreviewClick(el(['[data-preview-block]']))).toBe(true)
    expect(blocksPreviewClick(el([], { control: { type: 'file' } }))).toBe(true)
    expect(blocksPreviewClick(el([], { control: null, input: { type: 'file' } }))).toBe(true)
  })

  it('ignores targets that are not elements', () => {
    expect(blocksPreviewClick(null)).toBe(false)
    expect(blocksPreviewClick({})).toBe(false)
  })
})
