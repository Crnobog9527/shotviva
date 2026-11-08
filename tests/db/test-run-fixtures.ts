import type { Client } from 'pg'

// Admin test runs share one global daily budget (system_settings.admin_test_daily_budget_usd) and
// one day's spend. The files that run them (admin-test-runs, template-cover-locales) set the budget
// relative to what today already holds, so they must not run at the same time: each holds this
// session advisory lock on its own connection from beforeAll to afterAll.
const TEST_BUDGET_LOCK = 4_710_085

export async function holdTestBudget(db: Client): Promise<() => Promise<void>> {
  await db.query('select pg_advisory_lock($1)', [TEST_BUDGET_LOCK])
  return async () => {
    await db.query("delete from public.system_settings where key = 'admin_test_daily_budget_usd'")
    await db.query('select pg_advisory_unlock($1)', [TEST_BUDGET_LOCK])
  }
}
