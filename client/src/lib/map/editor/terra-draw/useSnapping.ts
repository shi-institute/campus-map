import { queryLngLat } from '$lib/utils/features';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import { LngLat } from 'maplibre-gl';
import type { getMapContext } from 'svelte-maplibre-gl';
import { get, readable } from 'svelte/store';
import type { TerraDrawMouseEvent } from 'terra-draw';

/**
 * Creates the snapping configuration for TerraDraw with custom snapping logic.
 *
 * This will snap to nearby features from the map. The currently change segment
 * of the feature being drawn will be excluded from snapping.
 *
 * If no features are within the max distance, no snapping will occur.
 *
 * To disable the snapping on-demand, pass in a boolean Svelte store to the `disabled` parameter.
 */
export function useSnapping(
  mapCtx: ReturnType<typeof getMapContext>,
  disabled = readable(false),
  maxDistance = 10
) {
  return {
    toCustom(event: TerraDrawMouseEvent, context: unknown) {
      if (!mapCtx.map || get(disabled)) {
        return undefined;
      }

      const maxDistance = 10; // in pixels

      const cursorLngLat = new LngLat(event.lng, event.lat);
      const nearbyFeatures = queryLngLat(mapCtx.map, cursorLngLat, maxDistance).filter(
        (feature) =>
          feature.source === 'esri' ||
          (feature.source.startsWith('td-') &&
            !feature.properties.snappingPoint &&
            !feature.properties.midPoint &&
            !feature.properties.selectionPoint &&
            !feature.properties.selected)
      );
      if (nearbyFeatures.length === 0) {
        return undefined;
      }

      // remove the last coordinate from terradraw linesstring features
      // to avoid snapping to the part the user is currently drawing
      const currentlyDrawingFeature = nearbyFeatures.find(
        (feature) => feature.source.startsWith('td-') && feature.properties.currentlyDrawing
      );
      const currentLineStringCoordinates =
        currentlyDrawingFeature?.geometry.type === 'LineString'
          ? currentlyDrawingFeature.geometry.coordinates.slice(0, -1)
          : [];

      function geometryToFlatCoordinates(geometry: GeoJSON.Geometry): GeoJSON.Position[] {
        if (geometry.type === 'Point') {
          return [geometry.coordinates];
        }
        if (geometry.type === 'MultiPoint') {
          return geometry.coordinates;
        }
        if (geometry.type === 'LineString') {
          return geometry.coordinates;
        }
        if (geometry.type === 'MultiLineString') {
          return geometry.coordinates.flat(1);
        }
        if (geometry.type === 'Polygon') {
          return geometry.coordinates.flat(1);
        }
        if (geometry.type === 'MultiPolygon') {
          return geometry.coordinates.flat(2);
        }
        if (geometry.type === 'GeometryCollection') {
          return geometry.geometries.flatMap((geom) => geometryToFlatCoordinates(geom));
        }
        return [];
      }

      const nearbyFeatureCoordinates = [
        ...currentLineStringCoordinates,
        ...nearbyFeatures
          .filter((feature) => !feature.source.startsWith('td-') || !feature.properties.currentlyDrawing)
          .flatMap((feature) => geometryToFlatCoordinates(feature.geometry)),
      ];

      const sortedByDistance = nearbyFeatureCoordinates.sort((a, b) => {
        const distanceToA = (a[0] - event.lng) * (a[0] - event.lng) + (a[1] - event.lat) * (a[1] - event.lat);
        const distanceToB = (b[0] - event.lng) * (b[0] - event.lng) + (b[1] - event.lat) * (b[1] - event.lat);
        return distanceToA - distanceToB;
      });
      const closestCoordinate = sortedByDistance[0];
      if (!closestCoordinate) {
        return undefined;
      }

      // if the ensure that the closest point is still within the max distance
      // prefer snapping to that point
      const cursorPoint = mapCtx.map.project(cursorLngLat);
      const snappedPoint = mapCtx.map.project(new LngLat(closestCoordinate[0], closestCoordinate[1]));
      if (cursorPoint.dist(snappedPoint) <= maxDistance) {
        return closestCoordinate;
      }

      // otherwise, if there were nearby features, prefer snapping to the
      // closest point on the closest feature
      const nearbyLines = nearbyFeatures
        .flatMap((feature): GeoJSON.Feature<GeoJSON.LineString>[] | undefined => {
          // do not allow snapping to the midpoint of the currently drawing linestring
          if (feature.properties.currentlyDrawing) {
            return undefined;
          }

          // convert polygons and multi line strings to line strings
          if (feature.geometry.type === 'Polygon') {
            return feature.geometry.coordinates.map((ring) => ({
              ...feature,
              geometry: { type: 'LineString', coordinates: ring },
            }));
          }
          if (feature.geometry.type === 'MultiPolygon') {
            return feature.geometry.coordinates
              .flat()
              .map((ring) => ({ ...feature, geometry: { type: 'LineString', coordinates: ring } }));
          }
          if (feature.geometry.type === 'MultiLineString') {
            return [
              {
                ...feature,
                geometry: { type: 'LineString', coordinates: feature.geometry.coordinates.flat() },
              },
            ];
          }
          if (feature.geometry.type === 'LineString') {
            return [
              { ...feature, geometry: { type: 'LineString', coordinates: feature.geometry.coordinates } },
            ];
          }
        })
        .filter((x) => !!x);
      if (nearbyLines.length === 0) {
        return undefined;
      }

      const nearestPoint = nearbyLines
        .map((line) => {
          return nearestPointOnLine(line, cursorLngLat.toArray());
        })
        .sort((a, b) => a.properties.dist - b.properties.dist)[0];

      return nearestPoint.geometry.coordinates;
    },
  };
}
