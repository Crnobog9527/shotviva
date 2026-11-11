'use client'

import { useEffect, useRef } from 'react'

import { usePathname } from '@/core/i18n/navigation'

import { EDIT_QUERY } from '../../edit-ui/edit-link'
import { useViewer } from './viewer-context'
import { opensEditFrom, workIdOf } from './viewer-path'

// Keeps the viewer on the address: a deep link or refresh of /photos/<id> opens that work, Back
// and Forward close and reopen it. Only a change of path counts, so the viewer's own pushes
// (already in its state) are no-ops. Its own Suspense in the layout: on /photos/[jobId] the path
// is request data.
export function ViewerSync() {
  const follow = useViewer()?.follow
  const id = workIdOf(usePathname())
  const first = useRef(true)
  useEffect(() => {
    const edit = first.current && id !== null && opensEditFrom(window.location.search)
    first.current = false
    follow?.(id, edit ? 'edit' : 'detail')
    // Once open, drop ?edit=1 so a refresh or Back does not open the form again.
    if (edit) dropEditQuery()
  }, [id, follow])
  return null
}

function dropEditQuery() {
  const url = new URL(window.location.href)
  url.searchParams.delete(EDIT_QUERY)
  window.history.replaceState(null, '', url)
}
