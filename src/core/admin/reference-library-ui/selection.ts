export function toggleRange(selected: Set<string>, ids: string[], id: string, anchor: string | null, range: boolean) {
  const next = new Set(selected)
  const index = ids.indexOf(id)
  const from = anchor ? ids.indexOf(anchor) : -1
  if (range && from >= 0 && index >= 0) {
    for (const value of ids.slice(Math.min(index, from), Math.max(index, from) + 1)) next.add(value)
  } else if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function tagList(text: string) {
  return [...new Set(text.split(/[,，]/u).map(value => value.trim()).filter(Boolean))]
}

export function validTags(tags: string[]) { return tags.length <= 32 && tags.every(tag => tag.length <= 64) }
