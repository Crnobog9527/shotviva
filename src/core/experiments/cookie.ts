// The visitor's experiment assignments, one cookie for all experiments (ARCHITECTURE §16.5).
// Entries are `<experiment>.<current variant>.<first variant>[.<flag>]`, joined by `~`. Not
// httpOnly: the browser reads it to tag analytics events and clears the flags once reported.
// Flags: `n` new assignment, `r` moved off an archived variant, both still to be reported to
// PostHog; `f` forced on the test site (?sv_exp=…), never reported.

export const EXPERIMENT_COOKIE = 'sv_exp'
export const EXPERIMENT_COOKIE_MAX_AGE = 180 * 24 * 60 * 60

export type CookieFlag = '' | 'n' | 'r' | 'f'
export type CookieEntry = { experiment: number; current: number; first: number; flag: CookieFlag }

const ENTRY = /^(\d{1,12})\.(\d{1,12})\.(\d{1,12})(?:\.([nrf]))?$/
// A handful of experiments at most; anything longer is not ours.
const MAX_ENTRIES = 12

export function parseExperimentCookie(value: string | undefined | null): Map<number, CookieEntry> {
  const entries = new Map<number, CookieEntry>()
  if (!value) return entries
  for (const part of value.split('~').slice(0, MAX_ENTRIES)) {
    const match = ENTRY.exec(part)
    if (!match) continue
    const experiment = Number(match[1])
    entries.set(experiment, { experiment, current: Number(match[2]), first: Number(match[3]), flag: (match[4] ?? '') as CookieFlag })
  }
  return entries
}

export function serializeExperimentCookie(entries: Iterable<CookieEntry>): string {
  return [...entries]
    .map(({ experiment, current, first, flag }) => `${experiment}.${current}.${first}${flag ? `.${flag}` : ''}`)
    .join('~')
}
