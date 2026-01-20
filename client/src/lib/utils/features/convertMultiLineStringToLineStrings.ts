export function convertMultiLineStringToLineStrings(
  multiLineString: GeoJSON.MultiLineString
): GeoJSON.LineString[] {
  return multiLineString.coordinates.map((lineCoords) => ({ type: 'LineString', coordinates: lineCoords }));
}
