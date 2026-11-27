// Some templates store the optional mark inside the copy field label ("Dish name (optional)",
// "菜名（选填）"); the form adds its own mark for non-required fields, so strip a trailing one here.
const TRAILING_OPTIONAL = /\s*[(（]\s*(?:optional|选填)\s*[)）]\s*$/i

export function stripOptionalMark(label: string): string {
  const stripped = label.replace(TRAILING_OPTIONAL, '')
  return stripped.trim() === '' ? label : stripped
}
