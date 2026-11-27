import { isSlotTemplate, type CatalogueTemplate } from '../../catalogue/catalogue-template'
import type { TemplateSet } from '../../workspace/template-set'
import type { HomeCatalogue } from '../home-catalogue'
import { PANEL_PARAM, SET_PARAM, setRefParam, type BundleInfo, type PanelRequest, type ResolvedPanel, type SetRef } from './panel-request'

// The panel's own half of opening (loaded with it, template-panel.tsx): which set it shows, and
// where sign-up comes back to. What a click or an address asks for is read in panel-request.ts,
// which the page loads up front.

// Where sign-up comes back to: this page (home or a landing page, in its language) with the
// panel open on this template and set. The uploaded photo does not come back (out of scope for
// this version, Owner 2026-11-25); the sign-up pages keep `next` to same-site paths only.
export function panelReturnPath(pagePath: string, request: Pick<PanelRequest, 'templateId' | 'set'>): string {
  const query = new URLSearchParams({ [PANEL_PARAM]: request.templateId })
  if (request.set) query.set(SET_PARAM, setRefParam(request.set))
  return `${pagePath}?${query}`
}

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
