<script lang="ts">
  import { LeftPane } from '$lib/components';
  import { BellTowerLogo } from '$lib/icons';
  import SceneFooter from '$lib/map/SceneFooter.svelte';
  import { copyToClipboard, isGeoJsonLineStringFeatureCollection } from '$lib/utils';
  import type { MapMouseEvent } from 'maplibre-gl';
  import {
    CustomControl,
    GlobeControl,
    HillshadeLayer,
    MapLibre,
    NavigationControl,
    RasterDEMTileSource,
    RasterLayer,
    RasterTileSource,
    Terrain,
    TerrainControl,
  } from 'svelte-maplibre-gl';

  let center = $state([-82.43915171317023, 34.92549441017741] as [number, number]); // New York City
  let zoom = $state(16);
  let map = $state<maplibregl.Map | undefined>(undefined);

  /**
   * Implements right click to copy coordinates to clipboard
   * @param event
   */
  function handleRightClick(event: MapMouseEvent) {
    // copy coordinates to clipboard (lat-lon) (y-x) (EPSG:4326)
    const coordinates = [event.lngLat.lat, event.lngLat.lng];
    copyToClipboard(coordinates.join(', '));
  }

  let startLocation = $state('');
  const startLocationCoordinates = $derived.by(() => {
    const parts = startLocation.split(',').map((part) => parseFloat(part.trim()));
    if (parts.length !== 2 || parts.some(isNaN)) {
      return null;
    }
    return [parts[1], parts[0]] as [number, number]; // x, y
  });
  let endLocation = $state('');
  const endLocationCoordinates = $derived.by(() => {
    const parts = endLocation.split(',').map((part) => parseFloat(part.trim()));
    if (parts.length !== 2 || parts.some(isNaN)) {
      return null;
    }
    return [parts[1], parts[0]] as [number, number]; // x, y
  });

  function solveRoute() {
    if (!startLocationCoordinates || !endLocationCoordinates || !map) {
      return;
    }

    const startX = startLocationCoordinates[0];
    const startY = startLocationCoordinates[1];
    const endX = endLocationCoordinates[0];
    const endY = endLocationCoordinates[1];
    const crs = 'EPSG:4326'; // right click copies lat-lon (WGS 84)

    fetch('http://localhost:3000/arcgis/rest/services/FurmanCampusGraph/FU.RoutingServer/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startX, startY, endX, endY, crs }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (isGeoJsonLineStringFeatureCollection(json)) {
          return json;
        } else {
          if (map?.getSource('route-source')) {
            map.removeLayer('route-layer');
            map.removeSource('route-source');
          }

          throw new Error('Invalid GeoJSON response');
        }
      })
      .then((geojson) => {
        if (!map) {
          return;
        }

        // add the route lines to the map
        const sourceId = 'route-source';
        if (map.getSource(sourceId)) {
          (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
        } else {
          map.addSource(sourceId, { type: 'geojson', data: geojson });
          map.addLayer({
            id: 'route-layer',
            type: 'line',
            source: sourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ff0000', 'line-width': 6 },
          });
        }
      });
  }
</script>

<MapLibre
  bind:map
  class="map-container"
  bind:center
  bind:zoom
  style="http://localhost:3000/arcgis/rest/services/FurmanCampusMap/VectorTileServer/resources/styles/root.json"
  attributionControl={false}
  oncontextmenu={handleRightClick}
>
  <CustomControl position="top-left">
    <LeftPane title="Directions">
      <p>
        Right click the map to copy the coordinates of that location. Then, paste the coordinates into the
        boxes below.
      </p>
      <label for="">
        Start location
        <input type="text" bind:value={startLocation} />
      </label>
      <label for="">
        End location
        <input type="text" bind:value={endLocation} />
      </label>
      <button
        onclick={solveRoute}
        style="all: revert;"
        disabled={!startLocationCoordinates || !endLocationCoordinates}>Solve Route</button
      >
    </LeftPane>
  </CustomControl>
  <ThemeSwitcher position="bottom-left" />
  <SceneFooter position="bottom-right" />
  <NavigationControl />
  <TerrainControl source="terrain" />
  <GlobeControl />
  <RasterTileSource
    tiles={['https://tile.openstreetmap.org/{z}/{x}/{y}.png']}
    maxzoom={19}
    attribution="&copy; OpenStreetMap contributors"
  >
    <!-- show the raster tiles before the first layer in the vector tiles, which ensures it is the bottom layer (basemap) -->
    <RasterLayer beforeId="4WD [Road]" paint={{ 'raster-opacity': 0.2 }} />
  </RasterTileSource>
  <RasterDEMTileSource
    id="terrain"
    tiles={['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']}
    minzoom={0}
    maxzoom={15}
    encoding="terrarium"
    attribution="<a href='https://github.com/tilezen/joerd/blob/master/docs/attribution.md'>Mapzen (Terrain)</a>"
  >
    <Terrain />
    <!-- TODO: enable hillshade when in hiking/trails mode -->
    <!-- <HillshadeLayer /> -->
  </RasterDEMTileSource>
</MapLibre>

<style>
  /* always show the map on the full screen on the bottom layer */
  :global(.map-container) {
    position: absolute !important;
    inset: 0;
    z-index: 0;
    background-color: white;
  }
</style>
