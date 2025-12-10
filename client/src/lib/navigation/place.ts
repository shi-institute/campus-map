import { base64UrlEncode, stringToLngLat } from '$lib/utils';
import { SvelteURL } from 'svelte/reactivity';
import { z } from 'zod';

export interface FoundPlaceRoute {
  type: 'place';
  data: PlaceData;
}

interface PlaceData {
  layerId: string;
  featureId: string | number;
  centroid: maplibregl.LngLat;
}

/**
 * Attempts to interpret a place route from the given URL.
 *
 * A place route URL is expected to have the following format:
 * /place/:layerId/:featureId/@:lng,:lat,
 *
 * where:
 * - :layerId is the ID of the layer containing the place
 * - :featureId is the ID of the feature representing the place
 * - @:lng,:lat is the centroid of the place in "lng,lat" format, prefixed by '@'
 */
export function interpretPlaceRoute(url: SvelteURL): FoundPlaceRoute | null {
  const pathSegments = url.pathname.split('/');

  const isPlacePath = pathSegments[1] === 'place';
  if (!isPlacePath) {
    return null;
  }

  // get the layer id
  const layerId = decodeURIComponent(pathSegments[2]);
  if (!layerId) {
    return null;
  }

  // get and parse the feature id
  const featureIdPart = decodeURIComponent(pathSegments[3]);
  if (!featureIdPart) {
    return null;
  }
  const featureId = isNaN(Number(featureIdPart)) ? featureIdPart : Number(featureIdPart);

  // get and parse the centroid
  const centroidPart = pathSegments[4];
  if (!centroidPart || !centroidPart.startsWith('@')) {
    return null;
  }
  const centroidLngLatString = centroidPart.slice(1);
  const centroid = stringToLngLat(centroidLngLatString, 'lat-lng');
  if (!centroid) {
    return null;
  }

  return { type: 'place', data: { layerId, featureId, centroid } };
}

/**
 * Constructs a SvelteURL for a place route.
 */
export function buildPlaceRoute(place: PlaceData, passthroughData: Record<string, unknown> = {}): SvelteURL {
  const layerIdEncoded = encodeURIComponent(place.layerId);
  const featureIdEncoded = encodeURIComponent(String(place.featureId));
  const centroidLatLngString = `@${place.centroid.lat},${place.centroid.lng}`;

  const dataObject: z.infer<typeof placeDataSchema> = { ...passthroughData };

  const dataJson = JSON.stringify(dataObject);
  const dataBase64 = base64UrlEncode(dataJson);

  const pathname = `/place/${layerIdEncoded}/${featureIdEncoded}/${centroidLatLngString}`;
  const url = new URL(pathname, window.location.origin);
  url.searchParams.set('data', dataBase64);

  return new SvelteURL(url);
}

const placeDataSchema = z.looseObject({ place: z.object({}).optional() });
