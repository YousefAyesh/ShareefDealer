export type SlugInput = {
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  sourceKey: string
}

/** Last 8 characters of the source key, lowercased -- enough to disambiguate. */
function keySuffix(sourceKey: string): string {
  return sourceKey.slice(-8).toLowerCase()
}

export function buildSlug(input: SlugInput): string {
  const parts = [
    input.year ? String(input.year) : null,
    input.make,
    input.model,
    input.trim,
    keySuffix(input.sourceKey),
  ].filter((p): p is string => Boolean(p && p.trim()))

  return parts
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}
