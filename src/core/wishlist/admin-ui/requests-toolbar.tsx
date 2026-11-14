import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { REQUEST_STATUSES, type RequestStatus } from '../types'
import { COPY } from './copy'
import type { RequestFilter, RequestSort } from './filter-requests'

type Props = {
  filter: RequestFilter
  counts: Record<RequestStatus, number>
  onStatus: (status: RequestStatus) => void
  onSort: (sort: RequestSort) => void
  onQuery: (query: string) => void
}

export function RequestsToolbar({ filter, counts, onStatus, onSort, onQuery }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1" role="tablist">
        {REQUEST_STATUSES.map((status) => (
          <Button
            key={status}
            role="tab"
            aria-selected={filter.status === status}
            size="sm"
            variant={filter.status === status ? 'default' : 'outline'}
            onClick={() => onStatus(status)}
          >
            {COPY.tabLabel(COPY.tabs[status], counts[status])}
          </Button>
        ))}
      </div>
      <div className="flex gap-1">
        {(['votes', 'newest'] as const).map((sort) => (
          <Button key={sort} size="sm" variant={filter.sort === sort ? 'secondary' : 'ghost'} onClick={() => onSort(sort)}>
            {COPY.sort[sort]}
          </Button>
        ))}
      </div>
      <Input
        className="max-w-xs"
        type="search"
        placeholder={COPY.search}
        aria-label={COPY.search}
        value={filter.query}
        onChange={(event) => onQuery(event.target.value)}
      />
    </div>
  )
}
