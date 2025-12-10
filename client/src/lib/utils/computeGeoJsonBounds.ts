import { LngLatBounds } from 'maplibre-gl';

/**
 * Computes a bounding box for the given GeoJSON FeatureCollection.
 *
 * If the FeatureCollection has a `bbox` property, it uses that to create
 * the bounding box. Otherwise, it manually computes the bounds by iterating
 * over all features and their coordinates.
 *
 * @param geojson The GeoJSON FeatureCollection to compute bounds for.
 * @returns A LngLatBounds object representing the bounding box, or null if not available.
 */
export function computeGeoJsonBounds(
  geojson: GeoJSON.FeatureCollection | null
): maplibregl.LngLatBounds | null {
  if (!geojson) {
    return null;
  }

  if (geojson.bbox && geojson.bbox.length === 4) {
    const [minX, minY, maxX, maxY] = geojson.bbox;
    return new LngLatBounds([minX, minY], [maxX, maxY]);
  }

  // manually compute bounds from features
  const bounds = new LngLatBounds();
  geojson.features
    // get each position from each feature
    .flatMap((feature) => {
      if (feature.geometry.type === 'Point') {
        return [feature.geometry.coordinates];
      }

      if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiPoint') {
        return feature.geometry.coordinates;
      }

      if (feature.geometry.type === 'MultiLineString' || feature.geometry.type === 'Polygon') {
        return feature.geometry.coordinates.flat();
      }

      if (feature.geometry.type === 'MultiPolygon') {
        return feature.geometry.coordinates.flat(2);
      }
    })
    // filter out invalid positions
    .filter((x) => !!x)
    // onlt keep valid [number, number] positions
    .filter(
      (x): x is [number, number] =>
        Array.isArray(x) && x.length === 2 && typeof x[0] === 'number' && typeof x[1] === 'number'
    )
    // extend bounds to include each position
    .forEach((position) => {
      bounds.extend(position);
    });
  return bounds;
}
