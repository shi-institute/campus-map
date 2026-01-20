<script lang="ts">
  import {
    convertMultiLineStringToLineStrings,
    getFeatureFromService,
    reprojectFeature,
  } from '$lib/utils/features';
  import { TerraDraw } from '@svelte-maplibre-gl/terradraw';
  import { onMount } from 'svelte';
  import { getMapContext } from 'svelte-maplibre-gl';
  import type { TerraDraw as Draw } from 'terra-draw';
  import {
    TerraDrawAngledRectangleMode,
    TerraDrawCircleMode,
    TerraDrawFreehandMode,
    TerraDrawLineStringMode,
    TerraDrawPointMode,
    TerraDrawPolygonMode,
    TerraDrawSelectMode,
  } from 'terra-draw';
  import { snapshot } from './snapshotStore';

  const mapCtx = getMapContext();
  if (!mapCtx.map) throw new Error('Map instance is not initialized.');

  const defaultSelectFlags = {
    feature: { draggable: true, coordinates: { deletable: true, midpoints: true, draggable: true } },
  };
  const modes = [
    new TerraDrawSelectMode({
      flags: {
        point: defaultSelectFlags,
        linestring: defaultSelectFlags,
        polygon: defaultSelectFlags,
        freehand: defaultSelectFlags,
        circle: defaultSelectFlags,
        'angled-rectangle': defaultSelectFlags,
      },
    }),
    new TerraDrawPointMode(),
    new TerraDrawLineStringMode(),
    new TerraDrawPolygonMode(),
    new TerraDrawCircleMode(),
    new TerraDrawFreehandMode(),
    new TerraDrawAngledRectangleMode(),
  ];
  const modeNames = modes.map((mode) => mode.mode);
  let mode = $state('select');
  let selected: string | number | null = $state(null);
  let draw: Draw | undefined = $state.raw();

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

      // copy to terradraw
      if (!draw) {
        console.error('TerraDraw instance is not initialized.');
        return;
      }
      if (!draw.enabled) {
        console.error('TerraDraw is not enabled.');
        return;
      }
      const result = draw?.addFeatures([
        {
          type: 'Feature',
          id: `${feature.id}.${resovledLayerId}`,
          geometry,
          properties: {
            ...feature.properties,
            mode:
              geometry.type === 'Point' ? 'point' : geometry.type === 'LineString' ? 'linestring' : 'polygon',
          },
        },
      ]);
      if (!result || result.length === 0) {
        console.error('Failed to add feature to TerraDraw.');
        return;
      }
      if (!result[0].valid) {
        console.error('Invalid feature for TerraDraw:', result[0]);
        return;
      }

      // if the feature was added to terradraw successfully,
      // hide it from the original map layer
      const matchingLayers = map
        .getStyle()
        .layers?.filter((layer) => layer.id.split('‾‾')[0] === resovledLayerId);
      for (const layer of matchingLayers) {
        // hide this feature from the original layer
        const currentFilter = map.getFilter(layer.id);
        const newCondition = ['!=', ['id'], feature.id] as maplibregl.ExpressionSpecification;
        const combinedFilter = currentFilter
          ? (['all', currentFilter, newCondition] as maplibregl.ExpressionSpecification)
          : newCondition;
        map.setFilter(layer.id, combinedFilter);
      }
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

      const radius = 1; // pixels
      const point = map.project(event.lngLat);
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [point.x - radius, point.y - radius],
        [point.x + radius, point.y + radius],
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

  // save features in the store so they can be restored if this
  // component is unmounted and remounted
  function recordFeatures() {
    snapshot.collect(draw);
  }

  // restore features when terradraw is re-enabled
  let restored = false;
  $effect(() => {
    if (restored || !draw || !draw.enabled) {
      return;
    }
    snapshot.restore(draw);
    restored = true;
  });

  // tell the app to offset the top map controls by the height of the
  // edit controls when the editor is mounted
  onMount(() => {
    document.documentElement.style.setProperty('--map-top-offset', '36px');
    return () => {
      document.documentElement.style.removeProperty('--map-top-offset');
    };
  });
</script>

<TerraDraw
  {mode}
  {modes}
  bind:draw
  onchange={recordFeatures}
  onselect={(featureId) => (selected = featureId)}
  ondeselect={() => (selected = null)}
  onfinish={() => (mode = 'select')}
  idStrategy={{
    isValidId: (id) => {
      return !!snapshot._parseId(id);
    },
    getId: () => snapshot.nextTerraDrawFeatureId,
  }}
/>

<!-- Draw controls -->
<div class="controls">
  {#each modeNames as modeName (modeName)}
    <label><input type="radio" bind:group={mode} value={modeName} class="mr-1" /> {modeName}</label>
  {/each}
  {#if selected}
    <button
      class="mt-1 rounded border px-1"
      onclick={() => {
        if (!selected) return;
        draw?.removeFeatures([selected]);
        draw?.deselectFeature(selected);
      }}>Remove</button
    >
  {/if}
</div>

<style>
  .controls {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: var(--map-top-offset);
    background: white;
    padding: 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    z-index: 1;
    border-bottom: 1px solid #ccc;
    box-sizing: border-box;
  }
</style>
