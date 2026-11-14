import { accountLabel } from '../users/label'
import type { UserListRow } from '../users/list-types'
import { USERS_COPY } from './copy'

const SHOWN = 6

type Person = Pick<UserListRow, 'id' | 'email' | 'phone'>

// Who a batch dialog will change: the count is in the title, the first few names here, so the
// admin can check the selection before confirming (ARCHITECTURE §10.a 「确认框列出受影响人数」).
export function BatchPeople({ people, label = USERS_COPY.batch.who }: { people: Person[]; label?: string }) {
  const rest = people.length - SHOWN
  return (
    <div className="grid gap-1 rounded-md border border-border bg-[var(--wash-faint)] p-3 text-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <ul className="grid gap-0.5">
        {people.slice(0, SHOWN).map((person) => (
          <li key={person.id} className="truncate font-mono text-xs">
            {accountLabel(person)}
          </li>
        ))}
      </ul>
      {rest > 0 ? <p className="text-xs text-muted-foreground">{USERS_COPY.batch.more(rest)}</p> : null}
    </div>
  )
}
