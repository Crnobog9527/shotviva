import { createNavigation } from 'next-intl/navigation'

import { routing } from './routing'

// Locale-aware replacements for next/link and next/navigation: `href="/photos"` renders
// `/zh/photos` on Chinese pages, and usePathname() returns the path without the prefix.
// Switching language is never one of these: it is a plain <a href> (LocaleSwitcher).
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
