// The shape of a next-intl translator, for pure helpers that pick which message to show
// (balance wording, failure reasons, meta lines). Components pass `useTranslations(ns)`;
// tests pass `createTranslator` over the real messages. All user-facing copy lives in
// site/messages/<locale>.json (TASKS T8 范围补充 2), never in code.
export type Translate = {
  (key: string, values?: Record<string, string | number | Date>): string
  has(key: string): boolean
}
