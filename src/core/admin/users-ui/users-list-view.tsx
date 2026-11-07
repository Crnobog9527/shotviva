import { EmptyState } from '../shell/admin-blocks'
import { hasListFilters, type UserFilters } from '../users/list-filters'
import { USERS_PAGE_SIZE, type UserListPage } from '../users/list-types'
import { USERS_COPY as COPY } from './copy'
import { UsersFilters } from './users-filters'
import { UsersList, type UserBatchActions } from './users-list'
import { UsersPagination } from './users-pagination'

type Props = { filters: UserFilters; list: UserListPage; actions: UserBatchActions }

// /admin/users (ARCHITECTURE §10.a): the filters, the count, a page of 50 users newest first,
// numbered pages. A user's detail opens in a dialog over this page (UserDialogHost).
export function UsersListView({ filters, list, actions }: Props) {
  const first = (list.page - 1) * USERS_PAGE_SIZE + 1
  const last = first + list.rows.length - 1
  return (
    <div className="grid gap-5">
      <UsersFilters filters={filters} />
      {list.rows.length === 0 ? (
        hasListFilters(filters) || list.page > 1 ? (
          <EmptyState title={COPY.empty} body={COPY.emptyHint} />
        ) : (
          <EmptyState title={COPY.emptyAll} />
        )
      ) : (
        <section className="grid gap-2" aria-label={COPY.total(list.total)}>
          <UsersList rows={list.rows} actions={actions} summary={<p className="text-sm text-muted-foreground tabular-nums">{COPY.range(first, last, list.total)}</p>} />
          <UsersPagination filters={filters} page={list.page} pageCount={list.pageCount} />
        </section>
      )}
    </div>
  )
}
