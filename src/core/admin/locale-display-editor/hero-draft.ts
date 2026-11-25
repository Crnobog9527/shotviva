import { HERO_SCENES_MAX, type HeroSceneEntry } from '@/core/templates/home-hero'

// One scope's 首屏大图 while the admin arranges it: templates in order, each with its caption
// (null: the template's name).

export function addScenes(list: readonly HeroSceneEntry[], ids: readonly string[]): HeroSceneEntry[] {
  const taken = new Set(list.map((entry) => entry.templateId))
  const fresh = ids.filter((id) => !taken.has(id) && taken.add(id)).map((templateId) => ({ templateId, caption: null }))
  return [...list, ...fresh].slice(0, HERO_SCENES_MAX)
}

export const removeScene = (list: readonly HeroSceneEntry[], id: string) => list.filter((entry) => entry.templateId !== id)

// The sortable list hands back ids; captions travel with their template.
export function reorderScenes(list: readonly HeroSceneEntry[], ids: readonly string[]): HeroSceneEntry[] {
  const byId = new Map(list.map((entry) => [entry.templateId, entry]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}

// A blank caption is the template's name again.
export const setCaption = (list: readonly HeroSceneEntry[], id: string, caption: string) =>
  list.map((entry) => (entry.templateId === id ? { ...entry, caption: caption.trim() ? caption : null } : entry))

const keyOf = (entry: HeroSceneEntry) => `${entry.templateId}\u0000${entry.caption?.trim() ?? ''}`
export const sameScenes = (a: readonly HeroSceneEntry[], b: readonly HeroSceneEntry[]) => a.map(keyOf).join('\n') === b.map(keyOf).join('\n')

export const scenesLeft = (list: readonly HeroSceneEntry[]) => Math.max(0, HERO_SCENES_MAX - list.length)
