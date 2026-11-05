import { Suspense } from 'react'

import { requireUser } from '@/core/auth'
import { connectPagePath, parseConnectRequest } from '@/core/partner'
import { ConnectView } from '@/core/partner/ui'
import { site } from '@/site/site.config'

const first = (value: string | string[] | undefined) => (typeof value === 'string' ? value : null)

// Graylum's "Connect Shotviva" lands here (ARCHITECTURE §14.2). Signed-out users go through
// Shotviva's own sign-in / sign-up first and come back with the same query.
async function Connect({ searchParams }: PageProps<'/connect/graylum'>) {
  const params = await searchParams
  const query = { state: first(params.state), return_to: first(params.return_to) }
  await requireUser(connectPagePath(query))
  const valid = parseConnectRequest(query, site.partners.graylum) !== null
  return <ConnectView valid={valid} state={query.state} returnTo={query.return_to} />
}

export default function ConnectGraylumPage(props: PageProps<'/connect/graylum'>) {
  return (
    <Suspense>
      <Connect {...props} />
    </Suspense>
  )
}
