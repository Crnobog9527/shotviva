// Compatibility for callers supplying their own OpenAI safeguard. Runtime admin saves resolve
// the selected model's measured floor and the current product catalogue instead.
export { OPENAI_MINIMUM as CREDITS_FLOOR } from '@/core/templates/provider-pricing'
