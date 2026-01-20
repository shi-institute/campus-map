/**
 * Given a feature service and a feature ID, fetches the feature as GeoJSON.
 */
export async function getFeatureFromService(servicePath: string, featureId: string | number) {
  const url = `/rest/services/${servicePath}/FeatureServer/0/query`;
  const searchParams = new URLSearchParams();
  searchParams.set('f', 'geojson');
  searchParams.set('outFields', '*');
  searchParams.set('returnGeometry', 'true');
  searchParams.set('outSR', '4326');
  searchParams.set('where', 'fid=' + featureId);

  const data = await fetch(url + '?' + searchParams, { method: 'GET', credentials: 'include' }).then((res) =>
    res.json()
  );

  const isFeatureCollection = data && data.type === 'FeatureCollection';
  if (!isFeatureCollection) {
    return null;
  }

  const containsOneFeature = data.features && data.features.length === 1;
  if (!containsOneFeature) {
    return null;
  }

  return data.features[0] as GeoJSON.Feature;
}
