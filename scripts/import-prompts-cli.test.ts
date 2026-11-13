import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const run = promisify(execFile)
const actor = '328576a9-f5b8-4c5d-b180-fe7b15deb02c'

it('runs the package entry point, rejects unflagged publication locally and uses one authorized import RPC', async () => {
  const dir = await mkdtemp(join(tmpdir(),'shotviva-import-test-'))
  const path = join(dir,'fake.json')
  const fixture = JSON.parse(await readFile('scripts/prompts.example.json','utf8'))
  fixture.templates[0].isActive = true
  await writeFile(path, JSON.stringify(fixture))
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const http = createServer(async (request,response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk)
    calls.push({ url: request.url ?? '', body: JSON.parse(Buffer.concat(chunks).toString()) })
    response.setHeader('content-type','application/json')
    response.end(request.url?.endsWith('/admin_image_pricing_catalog')
      ? JSON.stringify({version:'v2',unit_price:0.01,providers:[]}) : 'null')
  })
  await new Promise<void>(resolve => http.listen(0,'127.0.0.1',resolve))
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
    SUPABASE_SERVICE_ROLE_KEY:'local-fixture-key', SHOTVIVA_IMPORT_ADMIN_ID:actor }
  try {
    await expect(run('pnpm',['--silent','import:prompts',path],{env})).rejects.toMatchObject({ stderr: expect.stringContaining('--open-sale') })
    expect(calls).toHaveLength(0)
    const {stdout} = await run('pnpm',['--silent','import:prompts','--open-sale',path],{env})
    expect(stdout).toContain('done: 1 template(s)')
    expect(stdout).not.toContain('FAKE PROMPT')
    expect(calls.map(call=>call.url)).toEqual(['/rest/v1/rpc/admin_image_pricing_catalog','/rest/v1/rpc/admin_import_template'])
    expect(calls[1]?.body).toMatchObject({p_open_sale:true,p_actor:actor,p_template:{id:'example-burger-hero',is_active:true}})
    expect(calls[1]?.body).not.toHaveProperty('p_style_refs')
    // Since migration 1431 the database names the top tier 4k too: requests go out unchanged.
    const sent = calls[1]?.body.p_template as { credits_cost: Record<string, number> }
    expect(Object.keys(sent.credits_cost).sort()).toEqual(['1k', '2k', '4k'])
  } finally {
    await new Promise<void>(resolve => http.close(() => resolve()))
    await rm(dir,{recursive:true})
  }
}, 25_000)
