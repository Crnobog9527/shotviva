import { splitLocale } from '../../i18n/paths'
import { isOneOf, VITAL_ROUTES, type VitalLocale, type VitalRoute } from './fields'

// The page a report is about, reduced to its first path segment after the locale, and only when
// that segment is one of the allowlisted app roots. Ids, share codes, tokens, the query string
// and the hash never leave the browser: /photos/<id>?x=… is just "photos".
export function vitalsRouteRoot(pathname: string): { route: VitalRoute; locale: VitalLocale } | null {
  const bare = pathname.split(/[?#]/, 1)[0] ?? ''
  const { locale, path } = splitLocale(bare)
  const first = path.split('/')[1] ?? ''
  return isOneOf(VITAL_ROUTES, first) ? { route: first, locale } : null
}

// The path of a full URL (web-vitals' navigationURL) or of a bare path; null when unparsable.
export function pathOf(url: string, base: string): string | null {
  try {
    return new URL(url, base).pathname
  } catch {
    return null
  }
}
