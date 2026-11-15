// What one run of a template makes and costs, for every place that shows a price (resolution
// cards, catalogue cards, the poster editor's button). A template's credits_cost is per image;
// a template that makes a set (a dense poster's page kinds, ARCHITECTURE §5.3) charges one job
// per image, so the set costs that price times its images. Display only: the server charges
// each job at the per-image price, which adds up to exactly this total.

type SetFields = { poster?: { kinds: readonly unknown[] } } | undefined

// Images one run makes: the poster's page kinds, otherwise one.
export function imagesPerSet(fields: SetFields): number {
  return Math.max(1, fields?.poster?.kinds.length ?? 1)
}

// The credits one run costs at a per-image price.
export function setCredits(perImage: number, images = 1): number {
  return perImage * Math.max(1, Math.floor(images))
}
