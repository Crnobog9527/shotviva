import { readFileSync, unlinkSync } from 'node:fs'
import { mkdir, open, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { RunError } from '../template-apply/batch-file'

// One paid templates:judge run per .local/trials at a time: judge.json is read, paid for and
// written back as one transaction, so a second run must not start in between. The lock is a file
// created exclusively, holding the owner's pid; only that exclusive create ever takes it. A lock
// whose process is gone (killed, crashed) is never taken over automatically: two runs could both
// see it stale and one would delete the other's fresh lock. The run stops and says which file to
// delete instead, which is fine for a local tool.

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

export async function lockLedger(root: string, isAlive: (pid: number) => boolean = alive): Promise<() => Promise<void>> {
  await mkdir(root, { recursive: true })
  const path = join(root, LOCK_FILE)
  try {
    const handle = await open(path, 'wx')
    try { await handle.writeFile(String(process.pid)) } finally { await handle.close() }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const owner = Number((await readFile(path, 'utf8').catch(() => '')).trim())
    if (Number.isInteger(owner) && owner > 0 && isAlive(owner)) {
      throw new RunError(`另一个 templates:judge 正在用 ${root}（进程 ${owner}），等它结束再跑；没有调用模型`)
    }
    throw new RunError(`${path} 是上次中断的评审留下的锁（进程已不在）。确认没有别的 templates:judge 在跑后删掉这个文件再重跑；没有调用模型`)
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
