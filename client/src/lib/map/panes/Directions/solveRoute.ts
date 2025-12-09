import { isGeoJsonLineStringFeatureCollection } from '$lib/utils';
import { LngLat } from 'maplibre-gl';

interface SolveRouteParams {
  map: maplibregl.Map;
  startLngLat: maplibregl.LngLatLike;
  endLngLat: maplibregl.LngLatLike;
  throwOnError?: boolean;
}

/**
 * Solves a route between two points using the campus map routing server.
 */
export async function solveRoute({ map, startLngLat, endLngLat, throwOnError = false }: SolveRouteParams) {
  if (!startLngLat || !endLngLat || !map) {
    return null;
  }

  const resolvedStart = LngLat.convert(startLngLat);
  const resolvedEnd = LngLat.convert(endLngLat);

  const startX = resolvedStart.lng;
  const startY = resolvedStart.lat;
  const endX = resolvedEnd.lng;
  const endY = resolvedEnd.lat;
  const crs = 'EPSG:4326'; // right click copies lat-lon (WGS 84)

  const response = await fetch(
    `${import.meta.env.VITE_MAP_SERVER_URL}/rest/services/FurmanCampusGraph/FU.RoutingServer/solve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startX, startY, endX, endY, crs }),
    }
  )
    .then((res) => res.json())
    .then((json) => {
      if (isGeoJsonLineStringFeatureCollection(json)) {
        return json;
      }

      if (throwOnError) {
        throw new Error('Invalid GeoJSON response');
      }
      return null;
    });

  return response;
}
