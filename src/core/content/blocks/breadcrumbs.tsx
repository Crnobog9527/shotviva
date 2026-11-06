import { Link } from '../../i18n/ui'

import type { Crumb } from '../../seo'

export function Breadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex gap-2">
        {crumbs.map((crumb, i) => (
          <li key={crumb.path}>
            {i < crumbs.length - 1 ? <Link href={crumb.path}>{crumb.name}</Link> : crumb.name}
          </li>
        ))}
      </ol>
    </nav>
  )
}
