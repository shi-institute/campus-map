import { base64UrlDecode, base64UrlEncode, stringToLngLat } from '$lib/utils';
import { LngLat } from 'maplibre-gl';
import { SvelteURL } from 'svelte/reactivity';
import { z } from 'zod';

export interface FoundDirectionsRoute {
  type: 'directions';
  data: LooseDirectionsData;
}

interface LooseDirectionsData {
  orderedStops: ({ lngLat: maplibregl.LngLat; label?: string } | null)[];
  resolvedOrderedStops: { lngLat: maplibregl.LngLat; label?: string }[];
  method: string;
}

interface StrictDirectionsData {
  /**
   * An ordered list of stops for the directions route.
   *
   * undefined values will be omitted. Null values will be treated as blank stops.
   */
  orderedStops: ({ lngLat: maplibregl.LngLatLike; label: string } | undefined | null)[];
  method: string;
}

const defaultMethod = 'walking';

/**
 * Attempts to interpret a directions route from the given URL.
 *
 * A directions route URL is expected to have the following format:
 * /directions/:stop1/:stop2/.../:stopN,
 *
 * where at least two stops are provided (or empty strings), and each stop is a string
 * representing a location (e.g., "lng,lat" or a place name). If the stop place name
 * is used, there must also be a corresponding data query parameter in the URL with
 * a base-64 encoded JSON object mapping stop names to lng-lat coordinates.
 */
export function interpretDirectionsRoute(url: SvelteURL): FoundDirectionsRoute | null {
  // omit trailing slash
  if (url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  const pathSegments = url.pathname.split('/');

  const isDirectionsPath = pathSegments[1] === 'directions' || pathSegments[1] === 'dir';
  if (!isDirectionsPath) {
    return null;
  }

  const stopSegments = pathSegments.slice(2);
  if (stopSegments.length < 2) {
    // there must be at least two stops, even if they are empty strings
    return null;
  }

  const dataParam = url.searchParams.get('data');
  const data = (() => {
    if (!dataParam) {
      return undefined;
    }

    try {
      const decodedData = base64UrlDecode(dataParam);
      const json = JSON.parse(decodedData);
      const parsed = directionsDataSchema.parse(json);
      return parsed;
    } catch (error) {
      console.error('Failed to parse directions data from URL parameter:', error);
      return null;
    }
  })();

  const orderedStops = ((): FoundDirectionsRoute['data']['orderedStops'] => {
    // if the stop data was parsed from the data param, use it to resolve stop coordinates
    if (data?.dir.stops) {
      const dataStops = Object.entries(data.dir.stops).map(([label, lngLat]) => {
        return { lngLat, label } satisfies FoundDirectionsRoute['data']['orderedStops'][number];
      });

      // require every stop from the url to be present in the data
      const urlStopsCount = stopSegments.filter((s) => s !== '').length;
      const allStopsPresent = urlStopsCount <= dataStops.length;
      if (!allStopsPresent) {
        return [];
      }

      // if there are empty string stops in the URL, preserve their positions
      const finalStops: FoundDirectionsRoute['data']['orderedStops'] = [];
      let dataStopIndex = 0;
      for (const segment of stopSegments) {
        if (segment === '') {
          finalStops.push(null); // blank stop
        } else {
          finalStops.push(dataStops[dataStopIndex]);
          dataStopIndex++;
        }
      }

      return finalStops;
    }

    // otherwise, attempt to parse each segment in the URL as a "lat,lng" string
    const lngLatStops = stopSegments.map((segment) => stringToLngLat(segment, 'lat-lng'));

    // require every stop to resolve to a valid LngLat object
    const allStopsValid = lngLatStops.every((lngLat) => lngLat !== undefined);
    if (!allStopsValid) {
      return [];
    }

    // map to the expected format
    return lngLatStops.map((lngLat) => {
      return { lngLat: lngLat! } satisfies FoundDirectionsRoute['data']['orderedStops'][number];
    });
  })();

  const method = data?.dir.method ?? defaultMethod;

  return {
    type: 'directions',
    data: { orderedStops, resolvedOrderedStops: orderedStops.filter((x) => !!x), method },
  };
}

/**
 * Constructs a SvelteURL representing a directions route with the given data.
 *
 * Data includes an ordered list of stops (with lng-lat coordinates and labels)
 * and a travel method.
 */
export function buildDirectionsRoute(
  data: StrictDirectionsData,
  passthroughData: Record<string, unknown> = {}
): SvelteURL {
  const stopStrings = data.orderedStops
    .filter((x) => x !== undefined)
    .map((x) => {
      // use a blank string for null stops
      if (x === null) {
        return '';
      }

      // otherwise, convert the lng-lat to a "lat,lng" string
      const { lngLat } = x;
      const ll = LngLat.convert(lngLat);
      return `@${ll.lat},${ll.lng}`;
    });

  const dataObject: z.infer<typeof directionsDataSchema> = {
    ...passthroughData,
    dir: {
      stops: Object.fromEntries(
        data.orderedStops
          .filter((x) => !!x)
          .map(({ lngLat, label }) => {
            return [label, LngLat.convert(lngLat)];
          })
      ),
      method: data.method,
    },
  };

  const dataJson = JSON.stringify(dataObject);
  const dataBase64 = base64UrlEncode(dataJson);

  const pathname = `/directions/${stopStrings.join('/')}/`;
  const url = new URL(pathname, window.location.origin);
  url.searchParams.set('data', dataBase64);

  return new SvelteURL(url);
}

const directionsDataSchema = z.looseObject({
  dir: z.object({
    /** An ordered record mapping stop identifiers to their lng-lat coordinates */
    stops: z
      .record(
        z.string(),
        z
          .object({ lng: z.number(), lat: z.number() })
          .or(z.tuple([z.number(), z.number()]).transform(([lng, lat]) => ({ lng, lat })))
      )
      .default({})
      .transform((stops) => {
        // ensure LngLat objects
        const transformed: Record<string, maplibregl.LngLat> = {};
        for (const [label, coord] of Object.entries(stops)) {
          transformed[label] = LngLat.convert(coord);
        }
        return transformed;
      }),
    /** The travel method (walking, biking, wheelchair, etc.) */
    method: z.string().default(defaultMethod),
  }),
});
