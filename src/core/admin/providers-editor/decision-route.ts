import { DEFAULT_BASE_URL, OPENROUTER_BASE_URL } from '@/core/providers/types'

import { withModel, type ProviderForm } from './form-state'

// The decision row (T30) always talks the Responses protocol (adapter openai_responses, no
// migration). Which endpoint it uses is a form-only choice read from the stored address: OpenAI
// models go through OpenRouter with the Owner's OpenAI key as BYOK (Owner 2026-11-15), so a new
// row starts there, and a stored row on openrouter.ai opens as that choice.
export const DECISION_ROUTES = ['openrouter', 'openai'] as const
export type DecisionRoute = (typeof DECISION_ROUTES)[number]

const trimSlash = (url: string) => url.trim().replace(/\/+$/, '')

export function decisionRoute(form: Pick<ProviderForm, 'baseUrl'>): DecisionRoute {
  return trimSlash(form.baseUrl) === OPENROUTER_BASE_URL ? 'openrouter' : 'openai'
}

// OpenRouter names OpenAI's models openai/<name>; OpenAI's own endpoint takes the bare name.
function modelFor(route: DecisionRoute, model: string): string {
  const name = model.trim()
  if (!name) return model
  if (route === 'openrouter') return name.includes('/') ? name : `openai/${name}`
  return name.startsWith('openai/') ? name.slice('openai/'.length) : name
}

// Switching the route sets (and on OpenRouter locks) the address and renames the model; prices
// that were blank or the old model's table price follow the new name (withModel).
export function withDecisionRoute(form: ProviderForm, route: DecisionRoute): ProviderForm {
  const baseUrl = route === 'openrouter' ? OPENROUTER_BASE_URL : DEFAULT_BASE_URL
  return withModel({ ...form, baseUrl }, modelFor(route, form.model))
}

