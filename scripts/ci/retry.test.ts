import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./retry.sh', import.meta.url))

// A command that fails with `code` until it has run `failures` times, counting runs in a file.
function flaky(failures: number, code: number) {
  const counter = join(mkdtempSync(join(tmpdir(), 'retry-')), 'runs')
  const command = `n=$(( $(cat ${counter} 2>/dev/null || echo 0) + 1 )); echo $n > ${counter}; [ $n -gt ${failures} ] || exit ${code}`
  const result = spawnSync('bash', [script, 'bash', '-c', command], {
    env: { ...process.env, RETRY_BASE_DELAY: '0' },
    encoding: 'utf8',
  })
  return { status: result.status, stderr: result.stderr, runs: Number(readFileSync(counter, 'utf8')) }
}

// Downloads and image pulls in CI go through retry.sh (T88).
describe('retry.sh', () => {
  it('retries a transient failure until the command succeeds', () => {
    const result = flaky(2, 75)
    expect(result).toMatchObject({ status: 0, runs: 3 })
    expect(result.stderr).toContain('attempt 2 of 5')
  })

  it('gives up after 5 attempts and returns the last exit code', () => {
    const result = flaky(10, 75)
    expect(result).toMatchObject({ status: 75, runs: 5 })
    expect(result.stderr).toContain('failed 5 times')
  })

  it('does not retry a permanent failure (exit 64)', () => {
    expect(flaky(10, 64)).toMatchObject({ status: 64, runs: 1 })
  })
})
