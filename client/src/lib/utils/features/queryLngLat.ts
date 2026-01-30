/**
 * Gets the features at a given lngLat on the map.
 * The pixel box distance around the lngLat can be expanded,
 * causing the query to potentially return more features.
 */
export function queryLngLat(map: maplibregl.Map, lngLat: maplibregl.LngLat, boxDistancePixels = 1) {
  // define a small bounding box around the point
  const point = map.project(lngLat);
  const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
    [point.x - boxDistancePixels, point.y - boxDistancePixels],
    [point.x + boxDistancePixels, point.y + boxDistancePixels],
  ];

  // get the features within the bounding box
  const features = map.queryRenderedFeatures(bbox, {});
  return features;
}
