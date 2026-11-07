import { DEFAULT_LOCALE, LOCALES } from '../../i18n/locales'

// The old user detail page /admin/users/<id> is the detail dialog on the list now (ARCHITECTURE
// §10.a, T77): /admin/users?user=<id>. A lookup's ?job=<id> becomes the dialog's ?userJob=<id>
// (other query values pass through untouched). Declared in next.config.ts, as the T68 help
// redirects are, so they answer 307 before any rendering; /admin/users/suspicious is not a uuid
// and stays a page.

type Redirect = { source: string; destination: string; permanent: false; has?: { type: 'query'; key: string; value: string }[] }

const USER_ID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

function forPrefix(prefix: string): Redirect[] {
  const source = `${prefix}/admin/users/:id(${USER_ID})`
  return [
    { source, has: [{ type: 'query', key: 'job', value: `(?<job>${USER_ID})` }], destination: `${prefix}/admin/users?user=:id&userJob=:job`, permanent: false },
    { source, destination: `${prefix}/admin/users?user=:id`, permanent: false },
  ]
}

export function legacyUserRedirects(): Redirect[] {
  return LOCALES.flatMap((locale) => forPrefix(locale === DEFAULT_LOCALE ? '' : `/${locale}`))
}
