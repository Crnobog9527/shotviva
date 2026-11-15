import { readFileSync, unlinkSync } from 'node:fs'
import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { RunError } from '../template-apply/batch-file'

// One paid templates:judge run per .local/trials at a time: judge.json is read, paid for and
// written back as one transaction, so a second run must not start in between. The lock is a file
// created exclusively, holding the owner's pid. A lock whose process is gone (killed, crashed) is
// taken over; a live one stops the second run before it reads or spends anything.

export const LOCK_FILE = 'judge.lock'

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function create(path: string) {
  const handle = await open(path, 'wx')
  try { await handle.writeFile(String(process.pid)) } finally { await handle.close() }
}

export async function lockLedger(root: string, isAlive: (pid: number) => boolean = alive): Promise<() => Promise<void>> {
  await mkdir(root, { recursive: true })
  const path = join(root, LOCK_FILE)
  try {
    await create(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const owner = Number((await readFile(path, 'utf8').catch(() => '')).trim())
    if (Number.isInteger(owner) && owner > 0 && isAlive(owner)) {
      throw new RunError(`另一个 templates:judge 正在用 ${root}（进程 ${owner}），等它结束再跑；没有调用模型`)
    }
    // Left by a run that died: take it over. Another run doing the same at this instant loses the
    // exclusive create below and stops.
    await unlink(path).catch(() => undefined)
    await create(path).catch(() => { throw new RunError(`另一个 templates:judge 刚刚开始用 ${root}，没有调用模型`) })
  }
  // A second Ctrl-C exits at once (process.exit skips finally blocks): drop the lock on the way out.
  const onExit = () => {
    try { if (readFileSync(path, 'utf8').trim() === String(process.pid)) unlinkSync(path) } catch { /* already gone */ }
  }
  process.on('exit', onExit)
  return async () => {
    process.off('exit', onExit)
    onExit()
  }
}
