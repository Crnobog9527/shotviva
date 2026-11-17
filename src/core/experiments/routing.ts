import { splitLocale } from '../i18n/paths'
import { decideVariant } from './assign'
import { parseExperimentCookie, serializeExperimentCookie, type CookieEntry } from './cookie'
import type { ExperimentRegistry, LiveExperiment, SurfaceRoute } from './types'

// The proxy's part (ARCHITECTURE §16.5): for an address an experiment surface owns, which
// prerendered page answers and what the experiment cookie must hold. Pure.
// - crawlers always get the default page and no cookie, so search engines see one stable page;
// - ?sv_preview=<option> shows that option for this request only, writes nothing (admin preview);
// - ?sv_exp=<option> (test site and local only) puts this browser on the running experiment's
//   variant with that option, flagged so it is never counted.
// An option the code no longer has falls back to the default page, never to a missing route.

export const PREVIEW_PARAM = 'sv_preview'
export const FORCE_PARAM = 'sv_exp'
// The prerendered option pages; a direct request for them is a 404 (src/proxy.ts).
export const OPTION_PAGES = /^(?:\/zh)?\/x(?:\/|$)/

export type RouteInput = {
  pathname: string
  params: URLSearchParams
  cookie: string | undefined
  isBot: boolean
  random: () => number
  allowForce: boolean
}

// What this request needs from the experiment layer: `option` = what the page shows (null when the
// address is no surface's); `rewrite` = the path to serve instead (null = the page as requested);
// `cookie` = the new cookie value (null = leave it).
export type RouteOutcome = { option: string | null; rewrite: string | null; cookie: string | null }

const NOTHING: RouteOutcome = { option: null, rewrite: null, cookie: null }

export function surfaceAt(pathname: string, registry: ExperimentRegistry): SurfaceRoute | null {
  const { path } = splitLocale(pathname)
  return registry.find((route) => route.paths.includes(path)) ?? null
}

// The option page of `route` in the language of `pathname`, or null for the default option.
// `inExperiment`: the visitor is in a running or paused experiment (see defaultOptionPageInExperiment).
export function optionPath(pathname: string, route: SurfaceRoute, option: string, inExperiment = false): string | null {
  if (!route.options.some((known) => known.id === option)) return null
  if (option === route.defaultOption && !(inExperiment && route.defaultOptionPageInExperiment)) return null
  const { locale } = splitLocale(pathname)
  return `${locale === 'en' ? '' : `/${locale}`}/x/${route.surface}/${option}`
}

function forced(experiment: LiveExperiment, option: string): CookieEntry | undefined {
  const variant = experiment.status === 'running' ? experiment.variants.find((candidate) => candidate.option === option && !candidate.archived) : undefined
  return variant && { experiment: experiment.id, current: variant.id, first: variant.id, flag: 'f' }
}

// The visitor's variant of a live experiment, and the cookie when it changes.
function assigned(input: RouteInput, experiment: LiveExperiment): { option: string | null; cookie: string | null } {
  const entries = parseExperimentCookie(input.cookie)
  const force = input.allowForce ? input.params.get(FORCE_PARAM) : null
  const forcedEntry = force ? forced(experiment, force) : undefined
  if (forcedEntry) entries.set(experiment.id, forcedEntry)
  const decision = decideVariant(experiment, entries.get(experiment.id), input.random())
  if (!decision) return { option: null, cookie: null }
  if (decision.entry) entries.set(experiment.id, decision.entry)
  const changed = forcedEntry ?? decision.entry
  return { option: decision.variant.option, cookie: changed ? serializeExperimentCookie(entries.values()) : null }
}

export function routeExperiment(input: RouteInput, live: readonly LiveExperiment[], registry: ExperimentRegistry): RouteOutcome {
  const route = surfaceAt(input.pathname, registry)
  if (!route) return NOTHING
  const at = (option: string, cookie: string | null = null, inExperiment = false): RouteOutcome => ({ option, rewrite: optionPath(input.pathname, route, option, inExperiment), cookie })
  const preview = input.params.get(PREVIEW_PARAM)
  if (preview) return at(preview)
  const experiment = live.find((candidate) => candidate.surface === route.surface)
  if (input.isBot || !experiment) return at(route.defaultOption)
  const { option, cookie } = assigned(input, experiment)
  return at(option ?? route.defaultOption, cookie, experiment.status !== 'ended')
}
