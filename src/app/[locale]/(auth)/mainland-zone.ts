// Google does not load in mainland China. The Chinese sign-in pages always say so; the English
// ones used to decide by the visitor's IP country, which a static page does not know, so the
// browser decides by its time zone (auth-screens.tsx). Hong Kong and Macau have their own zones.
const MAINLAND_ZONES = new Set(['Asia/Shanghai', 'Asia/Urumqi', 'Asia/Chongqing', 'Asia/Harbin', 'PRC'])

export function inMainlandZone(zone: string | undefined = currentZone()): boolean {
  return zone !== undefined && MAINLAND_ZONES.has(zone)
}

function currentZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}
