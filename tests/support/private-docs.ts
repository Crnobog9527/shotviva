import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Internal documents (规范/, seo资料/, docs/) moved to the private repo Crnobog9527/shotviva-docs on
// 2026-11-11 and are no longer in this public repo. Locally that repo is cloned next to the code
// checkout (`../shotviva-docs`); worktrees under `.claude/worktrees/` find it by walking up.
// SHOTVIVA_DOCS_DIR overrides the lookup. CI has no copy, so tests that need one skip there.
function findDocsDir(): string | null {
  const fromEnv = process.env.SHOTVIVA_DOCS_DIR
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const candidate = join(dir, 'shotviva-docs')
    if (existsSync(join(candidate, '规范'))) return candidate
    if (dirname(dir) === dir) return null
  }
}

export const privateDocsDir = findDocsDir()

/** Absolute path of a file in the private docs repo, or null when it is not available. */
export function privateDoc(...parts: string[]): string | null {
  if (!privateDocsDir) return null
  const path = join(privateDocsDir, ...parts)
  return existsSync(path) ? path : null
}
