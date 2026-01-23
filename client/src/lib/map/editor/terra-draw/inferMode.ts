/**
 * Infers the value of the drawing mode from a GeoJSON geometry.
 *
 * This mode can be 'point', 'linestring', 'polygon', or null if the geometry type
 * does not correspond to a known drawing mode.
 *
 * New Terra Draw features must have the `mode` property set
 * in order for it to appear correctly in the editor.
 */
export function inferMode(geometry: GeoJSON.Geometry) {
  if (geometry.type === 'Point') {
    return 'point';
  }
  if (geometry.type === 'LineString') {
    return 'linestring';
  }
  if (geometry.type === 'Polygon') {
    return 'polygon';
  }
  return null;
}
