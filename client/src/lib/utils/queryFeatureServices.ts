import epsg from 'epsg-index/all.json';
import proj4 from 'proj4';
import { getAvailableFeatureServices } from './getAvailableFeatureServices';
import { isGeoJsonFeature, isGeoJsonFeatureCollection } from './isGeoJson';

// register all EPSG codes
for (const code in epsg) {
  proj4.defs(`EPSG:${code}`, (epsg as any)[code].proj4);
}

interface FeatureServiceQuerySpec {
  /**
   * A SQL-92 WHERE clause to filter the features. Defaults to '1=1' (all features).
   */
  where?: string;
  /**
   * List of field names to return. Defaults to all fields (`['*']`).
   */
  outFields?: string[];
  /**
   * Whether to return geometry with the features. Defaults to true.
   */
  returnGeometry?: boolean;
  /**
   * The maximum number of records to return. If not specified, all matching records are returned.
   */
  resultRecordCount?: number;
  /**
   * The offset of the first record to return. Used for pagination.
   */
  resultOffset?: number;
}

interface QueryFeatureServicesOptions {
  folder?: string;
  /**
   * A custom sort function to order the results of the query responses based on layer name.
   * @param a The first service object to compare.
   * @param b The second service object to compare.
   * @returns A negative number if `a` should come before `b`, a positive number if `a` should come after `b`, or zero if they are equal.
   */
  order?: (a: { layerId: string }, b: { layerId: string }) => number;
  abortSignal?: AbortSignal;
}

export async function queryFeatureServices(
  querySpec: Record<string, FeatureServiceQuerySpec> & { __default?: FeatureServiceQuerySpec },
  { folder = '/data', order, abortSignal }: QueryFeatureServicesOptions = {}
) {
  // folder must start with a slash
  if (!folder.startsWith('/')) {
    folder = `/${folder}`;
  }

  // if the cache of feature service names and pathnames is stale or missing, refresh it
  if (!featureServicesInfoCache[folder] || featureServicesInfoCache[folder].expiry < Date.now()) {
    featureServicesInfoCache[folder] = {
      data: getAvailableFeatureServices(folder),
      expiry: Date.now() + 5 * 60 * 1000, // cache for 5 minutes
      loading: true,
    };

    // once the promise resolves, set loading to false
    featureServicesInfoCache[folder].data!.then(() => {
      featureServicesInfoCache[folder].loading = false;
    });
  }

  if (!featureServicesInfoCache[folder]) {
    throw new Error('Feature services info is missing.');
  }

  const services = await featureServicesInfoCache[folder].data;
  if (!services) {
    throw new Error('Failed to load feature services info.');
  }

  function getQuerySpecForService(layerId: string) {
    return querySpec[layerId] || querySpec['__default'];
  }

  // prepare the services to query with their respective query specs
  const preparedServices = services.map((service) => {
    let serviceNameWithoutFolder = service.name.replace(`${folder.slice(1)}.`, '');
    if (serviceNameWithoutFolder.startsWith('"') && serviceNameWithoutFolder.endsWith('"')) {
      serviceNameWithoutFolder = serviceNameWithoutFolder.slice(1, -1);
    }

    return {
      ...service,
      layerId: serviceNameWithoutFolder,
      querySpec: getQuerySpecForService(serviceNameWithoutFolder),
    };
  });

  // only query the specified services, or if a default query spec is provided, query all services
  const serviceNamesFilter = '__default' in querySpec ? undefined : (Object.keys(querySpec) as string[]);
  const filteredServices = !serviceNamesFilter
    ? preparedServices
    : preparedServices.filter((service) => serviceNamesFilter.includes(service.layerId));

  return (
    Promise.all(
      // query all selected feature services in parallel
      filteredServices.map(async ({ layerId, encodedPathname, querySpec }) => {
        const queryEndpoint = `${import.meta.env.VITE_MAP_SERVER_URL}/rest/services${encodedPathname}/FeatureServer/query`;
        const url = new URL(queryEndpoint);
        url.searchParams.set('where', querySpec.where || '1=1');
        url.searchParams.set('f', 'geojson'); // use GeoJSON format instead of EsriJSON
        url.searchParams.set('outFields', querySpec.outFields?.join(',') || '*');
        url.searchParams.set('returnGeometry', querySpec.returnGeometry === false ? 'false' : 'true');
        if (querySpec.resultRecordCount !== undefined) {
          url.searchParams.set('resultRecordCount', querySpec.resultRecordCount.toString());
        }
        if (querySpec.resultOffset !== undefined) {
          url.searchParams.set('resultOffset', querySpec.resultOffset.toString());
        }

        const response = fetch(url.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: abortSignal,
        });
        return { layerId, response: await response };
      })
    )
      // retrieve JSON from all responses
      .then((responses) =>
        Promise.all(
          responses.map(async ({ layerId, response }) => {
            // resolve the GeoJSON from the response
            const geojson = await response.json();

            // verify that the response is valid GeoJSON
            if (!isGeoJsonFeatureCollection(geojson)) {
              throw new Error(`Invalid GeoJSON response from service: ${layerId}`);
            }

            return { layerId, geojson };
          })
        )
      )
      // sort the results if a sort function is provided
      .then((results) => (order ? results.sort((a, b) => order(a, b)) : results))
      // merge all GeoJSON FeatureCollections into one
      .then((results) => {
        const mergedFeatures = results
          .flatMap(({ layerId, geojson }) =>
            geojson.features.map((feature) => {
              // omit features that are missing the id (fid field)
              const id = feature.properties?.fid;
              if (typeof id !== 'number') {
                console.error(`Feature is missing 'fid' property for id in layer: ${layerId}`);
                return null;
              }

              return { ...feature, id, properties: { ...feature.properties, __layerId: layerId } };
            })
          )
          .filter((x) => x !== null);

        return { type: 'FeatureCollection', features: mergedFeatures } as GeoJSON.FeatureCollection<
          GeoJSON.Geometry & { crs?: { type?: string; properties?: { name: string } } },
          { __layerId: string; [key: string]: unknown }
        >;
      })
      // ensure all are using WG848 coordinates (assume missing crs is WG848)
      .then((geojson) => {
        const features = geojson.features
          .map((feature) => {
            const crs = feature.geometry.crs?.properties?.name || 'EPSG:4326';
            if (crs === 'EPSG:4326') {
              return feature;
            } else if (isGeoJsonFeature(feature)) {
              return {
                ...feature,
                crs: { type: 'name', properties: { name: 'EPSG:4326' } },
                geometry: {
                  ...feature.geometry,
                  // convert coordinates to EPSG:4326
                  coordinates: transformCoordinates(feature.geometry.coordinates, crs, 'EPSG:4326'),
                },
              };
            }
          })
          .filter((x) => !!x);

        return { ...geojson, features: features as typeof geojson.features };
      })
  );
  // merge all responses into a unified GeoJSON FeatureCollection
}

type Coordinates =
  | GeoJSON.Point['coordinates']
  | GeoJSON.MultiPoint['coordinates']
  | GeoJSON.LineString['coordinates']
  | GeoJSON.MultiLineString['coordinates']
  | GeoJSON.Polygon['coordinates']
  | GeoJSON.MultiPolygon['coordinates'];
type NestedCoordinates =
  | GeoJSON.MultiPoint['coordinates']
  | GeoJSON.LineString['coordinates']
  | GeoJSON.MultiLineString['coordinates']
  | GeoJSON.Polygon['coordinates']
  | GeoJSON.MultiPolygon['coordinates'];
function transformCoordinates(coords: Coordinates, fromCrs: string, toCrs: string): Coordinates {
  if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    // base case: [x, y]
    return proj4(fromCrs, toCrs, coords as [number, number]);
  }

  // otherwise recurse through deeper nested coordinate arrays
  return (coords as NestedCoordinates).map((c) =>
    transformCoordinates(c as Coordinates, fromCrs, toCrs)
  ) as Coordinates;
}

interface FeatureServiceInfoCache {
  [folder: string]: {
    data?: Promise<{ name: string; encodedPathname: string }[]>;
    expiry: number;
    loading: boolean;
  };
}

const featureServicesInfoCache: FeatureServiceInfoCache = {};
