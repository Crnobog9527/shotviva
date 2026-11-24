// An address with a route's own placeholder in it, such as /join/org/[token] or /blog/%5Bslug%5D:
// scanners build these from the route list. Next.js then renders the route's fallback shell at
// request time, which throws (InvariantError for the missing locale, NEXT_STATIC_GEN_BAILOUT on the
// blog, a 500 to the visitor). No real address has a whole segment like this: ids, slugs and invite
// tokens never contain brackets. The proxy answers these with a plain 404 before rendering.
const PLACEHOLDER_SEGMENT = /^(?:\[|%5B){1,2}(?:\.\.\.)?[A-Za-z_][\w-]*(?:\]|%5D){1,2}$/i

export function isRoutePlaceholderPath(pathname: string): boolean {
  return pathname.split('/').some((segment) => PLACEHOLDER_SEGMENT.test(segment))
}
