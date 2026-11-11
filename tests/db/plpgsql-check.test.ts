import { expect, it } from 'vitest'

import { connectAdmin } from './helpers'

// Statically checks every plpgsql function in public and admin. A plpgsql variable named like a
// queried column ("cents" in 1127's _validate_code_discount) only fails when that branch runs;
// plpgsql_check finds it without running it. The extension lives inside a rolled-back transaction,
// so it never becomes part of the schema.
it('has no plpgsql errors in public or admin functions', async () => {
  const db = await connectAdmin()
  try {
    await db.query('begin')
    await db.query('create extension if not exists plpgsql_check')
    const { rows } = await db.query(`
      select p.oid::regprocedure::text as fn, c.message, c.lineno
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
        lateral plpgsql_check_function_tb(p.oid, fatal_errors => false, other_warnings => false,
          extra_warnings => false, performance_warnings => false, security_warnings => false) c
       where n.nspname in ('public', 'admin')
         and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
         and p.prorettype <> 'trigger'::regtype
         and c.level = 'error'
       order by 1`)
    expect(rows).toEqual([])
  } finally {
    await db.query('rollback')
    await db.end()
  }
})
