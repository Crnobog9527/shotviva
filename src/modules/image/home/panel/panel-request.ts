import { isSlotTemplate, type CatalogueTemplate } from '../../catalogue/catalogue-template'
import type { TemplateSet } from '../../workspace/template-set'
import type { HomeCatalogue } from '../home-catalogue'

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

// Where sign-up comes back to: this page (home or a landing page, in its language) with the
// panel open on this template and set. The uploaded photo does not come back (out of scope for
// this version, Owner 2026-11-25); the sign-up pages keep `next` to same-site paths only.
export function panelReturnPath(pagePath: string, request: Pick<PanelRequest, 'templateId' | 'set'>): string {
  const query = new URLSearchParams({ [PANEL_PARAM]: request.templateId })
  if (request.set) query.set(SET_PARAM, setRefParam(request.set))
  return `${pagePath}?${query}`
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

const uniqueLive = (ids: readonly string[], byId: ReadonlyMap<string, CatalogueTemplate>) =>
  [...new Set(ids)].flatMap((id) => byId.get(id) ?? [])

type Found = { set: TemplateSet; ref: SetRef }

function seriesSet(catalogue: HomeCatalogue, byId: ReadonlyMap<string, CatalogueTemplate>, templateId: string, slug: string | null): Found | null {
  for (const entry of catalogue.browse?.entries ?? []) {
    if (entry.type !== 'series') continue
    const { series } = entry
    if (slug ? series.slug !== slug : !series.memberIds.includes(templateId)) continue
    const members = uniqueLive(series.memberIds, byId)
    if (members.length < 2 || !members.some((member) => member.id === templateId)) return null
    return { set: { id: `series:${series.id}`, kind: 'series', name: series.name, members }, ref: { kind: 'series', slug: series.slug } }
  }
  return null
}

function bundleSet(bundle: BundleInfo | null, ref: SetRef | null, byId: ReadonlyMap<string, CatalogueTemplate>, templateId: string): Found | null {
  if (!bundle || ref?.kind !== 'bundle') return null
  const members = uniqueLive(bundle.memberIds, byId)
  if (members.length < 2 || !members.some((member) => member.id === templateId)) return null
  return { set: { id: `bundle:${ref.id}`, kind: 'bundle', name: bundle.name, members }, ref }
}

// The set the panel shows, from live templates only: the bundle's members when it came from a
// bundle card (and the template is one of them), the series' when it came from a series card or
// the template belongs to one, else the template alone (no strip). Null when the template is not
// live here, or takes its images by named slot (§5.1e: those open in their own workspace).
export function resolvePanel(request: Pick<PanelRequest, 'templateId' | 'set'>, catalogue: HomeCatalogue, bundle: BundleInfo | null): ResolvedPanel | null {
  const byId = new Map(catalogue.templates.filter((template) => !isSlotTemplate(template)).map((template) => [template.id, template]))
  const template = byId.get(request.templateId)
  if (!template) return null
  const ref = request.set
  const found = bundleSet(bundle, ref, byId, template.id)
    ?? seriesSet(catalogue, byId, template.id, ref?.kind === 'series' ? ref.slug : null)
    ?? (ref?.kind === 'series' ? seriesSet(catalogue, byId, template.id, null) : null)
  if (found) return { ...found, startId: template.id }
  return { set: { id: `template:${template.id}`, kind: null, name: template.name, members: [template] }, startId: template.id, ref: null }
}
