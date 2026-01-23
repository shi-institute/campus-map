import {
  convertMultiLineStringToLineStrings,
  getFeatureFromService,
  reprojectFeature,
} from '$lib/utils/features';
import type { getMapContext } from 'svelte-maplibre-gl';
import type { GeoJSONStoreFeatures, TerraDraw } from 'terra-draw';
import type { EditorDoc } from '../editorDoc';
import { inferMode } from './inferMode';
import { normalizeFeature } from './normalizeFeature';

/**
 * Registers event handlers to convert map features to TerraDraw features on click.
 *
 * This will also register an event handler to change the cursor to a pointer when hovering over features.
 *
 * To increase the clickable area around features, increase the `pixelRadius` parameter.
 */
export async function convertMapFeatureToTerraDrawOnClick(
  mapCtx: ReturnType<typeof getMapContext>,
  doc: EditorDoc,
  draw: TerraDraw,
  pixelRadius = 1
) {
  // convert features to Terra Draw features on click
  $effect(() => {
    if (!mapCtx.map) {
      return;
    }

    async function convertFeatureToTerraDraw(event: maplibregl.MapMouseEvent) {
      const map = event.target;

      // define a small bounding box around the clicked point
      const radius = 1; // pixels
      const point = map.project(event.lngLat);
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [point.x - radius, point.y - radius],
        [point.x + radius, point.y + radius],
      ];

      // get the features within the bounding box
      const features = map.queryRenderedFeatures(bbox, {});
      if (features.length !== 1) {
        return;
      }
      const feature = features[0];

      // exclude terradraw features
      if (feature.layer.id.startsWith('td-')) {
        return;
      }

      // some styles generate extra layers for parallel lines,
      // but the base layer name always comes before '‾‾'
      const resovledLayerId = feature.layer.id.split('‾‾')[0];

      // get the full feature from the feature service
      // since the the feature may be simplified in the rendered layer
      // and span multiple tiles
      if (!feature.id) {
        console.error('Feature has no ID:', feature);
        return;
      }
      const completeFeature = await getFeatureFromService(`data/data."${resovledLayerId}"`, feature.id);
      if (!completeFeature) {
        console.error('Failed to fetch full feature from service:', feature);
        return;
      }
      let geometry = reprojectFeature(completeFeature, 'EPSG:4326').geometry;

      // convert multi geometries that only contain one part into single geometries
      if (geometry.type === 'MultiLineString') {
        geometry = convertMultiLineStringToLineStrings(geometry)[0];
      }

      // excude geometries that are no accepted by terradraw
      const allowedGeometries = ['Point', 'LineString', 'Polygon'];
      if (!allowedGeometries.includes(geometry.type)) {
        console.error(`Geometry type ${geometry.type} is not supported by TerraDraw.`, feature);
        return;
      }
      geometry = geometry as GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon;

      // reduce coordinate precision to no more than 9 decimal places
      function reducePrecision(
        coords: GeoJSON.Position | GeoJSON.Position[] | GeoJSON.Position[][]
      ): GeoJSON.Position | GeoJSON.Position[] | GeoJSON.Position[][] {
        if (typeof coords[0] === 'number') {
          return (coords as GeoJSON.Position).map((coord) => parseFloat(coord.toFixed(9)));
        } else {
          return (coords as any).map((c: any) => reducePrecision(c));
        }
      }
      geometry.coordinates = reducePrecision(geometry.coordinates);

      if (!draw) {
        console.error('TerraDraw instance is not initialized.');
        return;
      }
      if (!draw.enabled) {
        console.error('TerraDraw is not enabled.');
        return;
      }

      const featureForTerraDraw: GeoJSONStoreFeatures = {
        type: 'Feature',
        id: `${feature.id}.${resovledLayerId}`,
        geometry,
        properties: { ...feature.properties, mode: inferMode(geometry) },
      };

      // add the feature to TerraDraw
      const result = draw?.addFeatures([featureForTerraDraw]);
      if (!result || result.length === 0) {
        console.error('Failed to add feature to TerraDraw.');
        return;
      }
      if (!result[0].valid) {
        console.error('Invalid feature for TerraDraw:', result[0]);
        return;
      }
      if (!result[0].id) {
        console.error('Added TerraDraw feature has no ID:', result[0]);
        return;
      }

      // insert the feature into the tracked edits
      doc.trackedEdits.registerModifications(resovledLayerId, [
        normalizeFeature({ ...featureForTerraDraw, id: feature.id }),
      ]);

      // select the newly added feature (go to edit mode)
      draw.selectFeature(result[0].id);
    }

    mapCtx.map.on('click', convertFeatureToTerraDraw);
    return () => {
      if (!mapCtx.map) {
        return;
      }
      mapCtx.map.off('click', convertFeatureToTerraDraw);
    };
  });

  // change cursor to pointer when hovering over features
  $effect(() => {
    if (!mapCtx.map) {
      return;
    }

    function showPointerCursorOverFeatures(event: maplibregl.MapMouseEvent) {
      const map = event.target;

      const point = map.project(event.lngLat);
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [point.x - pixelRadius, point.y - pixelRadius],
        [point.x + pixelRadius, point.y + pixelRadius],
      ];

      const features = map.queryRenderedFeatures(bbox, {});

      if (
        (features.length > 0 && map.getCanvas().style.cursor === '') ||
        map.getCanvas().style.cursor === 'pointer'
      ) {
        map.getCanvas().style.cursor = 'pointer';
      } else if (map.getCanvas().style.cursor === 'pointer') {
        map.getCanvas().style.cursor = '';
      }
    }

    mapCtx.map.on('mousemove', showPointerCursorOverFeatures);
    return () => {
      if (!mapCtx.map) {
        return;
      }
      mapCtx.map.off('mousemove', showPointerCursorOverFeatures);
    };
  });
}
