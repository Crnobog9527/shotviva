import { Button } from '@/core/ui/button'

import type { AdminRequest } from '../types'
import { COPY } from './copy'

type Props = {
  request: AdminRequest
  pending: boolean
  onApprove: (request: AdminRequest) => void
  onReject: (request: AdminRequest) => void
  onShip: (request: AdminRequest) => void
}

// Only the moves the status machine allows from this row's status (ARCHITECTURE §15.1).
export function RequestRowActions({ request, pending, onApprove, onReject, onShip }: Props) {
  if (request.status === 'pending') {
    return (
      <div className="flex justify-end gap-2">
        <Button size="sm" disabled={pending} onClick={() => onApprove(request)}>
          {COPY.actions.approve}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => onReject(request)}>
          {COPY.actions.reject}
        </Button>
      </div>
    )
  }
  if (request.status === 'live') {
    return (
      <div className="flex justify-end gap-2">
        <Button size="sm" disabled={pending} onClick={() => onShip(request)}>
          {COPY.actions.ship}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => onReject(request)}>
          {COPY.actions.takeDown}
        </Button>
      </div>
    )
  }
  return null
}
