import type { TemplateSet } from '../../workspace/template-set'

// What opened the public template panel (Owner 2026-11-25): the template to show and, when it came
// from a 精选组合 card or a series card, that set. The page's cards say it in data attributes
// (core/content cannot import this module): data-pick-template (the template, kept current by the
// card's crossfade) and data-pick-set (`bundle:<card key>` or `series:<slug>`).
export type SetRef = { kind: 'bundle'; id: string } | { kind: 'series'; slug: string }
export type PanelRequest = { templateId: string; set: SetRef | null; file?: File | null }
// A bundle as its card lists it in the page: its name and every live member, in order.
export type BundleInfo = { name: string; memberIds: readonly string[] }

export const PANEL_PARAM = 'panel'
export const SET_PARAM = 'set'

// Template ids are slugs (some with a UUID tail), bundle card keys `bundle-<uuid>`, series and
// category slugs kebab-case; anything else in an address is ignored rather than looked up.
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/

export function parseSetRef(value: string | null | undefined): SetRef | null {
  const [kind, key, ...extra] = (value ?? '').split(':')
  if (extra.length > 0 || !key || !TOKEN.test(key)) return null
  if (kind === 'bundle') return { kind, id: key }
  if (kind === 'series') return { kind, slug: key }
  return null
}

// A browse chip's category path ("food-drink/chinese"): at most three slugs of the address shape;
// anything else is All.
export function browsePath(value: string | null | undefined): string[] {
  const path = (value ?? '').split('/').filter(Boolean)
  return path.length <= 3 && path.every((slug) => TOKEN.test(slug)) ? path : []
}

export const setRefParam = (ref: SetRef) => (ref.kind === 'bundle' ? `bundle:${ref.id}` : `series:${ref.slug}`)

// `?panel=<template id>&set=…` reopens the panel (the sign-up button's way back, below). The
// template and set are only names here: resolvePanel checks them against the live catalogue.
export function readPanelQuery(search: string): PanelRequest | null {
  const query = new URLSearchParams(search)
  const templateId = query.get(PANEL_PARAM)
  if (!templateId || !TOKEN.test(templateId)) return null
  return { templateId, set: parseSetRef(query.get(SET_PARAM)) }
}

// The address without the panel's query, once it has opened (a reload must not reopen it).
export function withoutPanelQuery(search: string): string {
  const query = new URLSearchParams(search)
  query.delete(PANEL_PARAM)
  query.delete(SET_PARAM)
  const rest = query.toString()
  return rest ? `?${rest}` : ''
}

// `ref`: the set as an address names it (for the way back after sign-up); null for a lone template.
export type ResolvedPanel = { set: TemplateSet; startId: string; ref: SetRef | null }
// An open panel: what it shows, and the photo picked on the first-screen card before it opened.
export type OpenPanel = ResolvedPanel & { file: File | null; opener: HTMLElement | null }
