/**
 * Parses feature IDs from terra draw layers.
 *
 * The ID format is: `"{featureId}.{layerId}"`, where featureId is an integer
 * and layerId is a string.
 */
export function parseFeatureId(id: string | number) {
  function toNumberSafe(value: string | number): number | null {
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  }

  if (typeof id !== 'string') {
    throw new Error('ID must be a string.');
  }

  const [featureIdString, ...rest] = id.split('.');
  const featureId = toNumberSafe(featureIdString);
  const layerId = rest.join('.');

  // require featureId to be an integer
  if (featureId === null || Number.isNaN(featureId) || !Number.isInteger(featureId)) {
    throw new Error('ID must start with an integer feature ID.');
  }

  // require layerId to be non-empty
  if (layerId.length === 0) {
    throw new Error('ID must contain a layer name after the feature ID.');
  }

  return { featureId, layerId };
}
