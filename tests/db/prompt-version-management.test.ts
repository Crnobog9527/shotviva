import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { connectAdmin, createUser } from './helpers'

it('locks the active version, audits deletion, and never reuses a deleted version number', async () => {
  const db = await connectAdmin()
  await db.query('begin')
  try {
    const actor = await createUser(db), id = 'qa-version-' + randomUUID()
    await db.query("insert into public.templates(id,name,category_key) values($1,$1,'pets')",[id])
    await db.query("insert into public.template_prompts(template_id,body) values($1,'fixture one')",[id])
    const manage = (v: number, action: string, name?: string) => db.query('select public.admin_manage_prompt_version($1,$2,$3,$4,$5)',[actor,id,v,action,name])
    const refused = async (fn: () => Promise<unknown>, code: string) => {
      await db.query('savepoint denied')
      await expect(fn()).rejects.toThrow(code)
      await db.query('rollback to denied')
    }
    await refused(() => manage(1,'rename','demo'),'FORBIDDEN')
    await db.query("update public.profiles set role='admin' where id=$1",[actor])
    await manage(1,'rename','demo')
    expect((await db.query('select display_name from public.template_prompt_versions where template_id=$1',[id])).rows[0].display_name).toBe('demo')
    await refused(() => manage(1,'delete'),'ACTIVE_VERSION')
    await db.query("update public.template_prompts set body='fixture two' where template_id=$1",[id])
    await db.query("select set_config('shotviva.restore_prompt_version','1',true)")
    await db.query("update public.template_prompts set body='fixture one' where template_id=$1",[id])
    await db.query("select set_config('shotviva.restore_prompt_version','',true)")
    await manage(2,'delete')
    expect((await db.query('select actor_id from admin.deleted_prompt_versions where template_id=$1 and version=2',[id])).rows[0].actor_id).toBe(actor)
    const next = await db.query("update public.template_prompts set body='fixture three' where template_id=$1 returning version",[id])
    expect(next.rows[0].version).toBe(3)
  } finally { await db.query('rollback'); await db.end() }
})
