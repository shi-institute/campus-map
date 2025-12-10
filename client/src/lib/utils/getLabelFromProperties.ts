/**
 * Given a properties object from GeoJSON, attempts to extract a name from it.
 *
 * Returns a tuple of [label, keyUsed], where `label` is the extracted label (or null if none found),
 * and `keyUsed` is the property key that was used to extract the label (or null if none found).
 *
 * If a fallback string is provided, it will be returned as the label if no other label is found.
 */
export function getLabelFromProperties(
  properties: Record<string, any> | null,
  fallback: string
): [string, string | null];
export function getLabelFromProperties(
  properties: Record<string, any> | null
): [string | null, string | null];
export function getLabelFromProperties(
  properties: Record<string, any> | null,
  fallback?: string
): [string | null, string | null] {
  if (!properties) {
    return [fallback ?? null, null];
  }

  const nameKeys = ['name', 'Name', 'NAME', 'label', 'Label', 'LABEL'];

  for (const key of nameKeys) {
    if (key in properties && typeof properties[key] === 'string') {
      return [properties[key], key];
    }
  }

  return [fallback ?? null, null];
}
