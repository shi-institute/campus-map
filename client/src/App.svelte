<script lang="ts">
  import { BellTowerLogo } from '$lib/icons';
  import SceneFooter from '$lib/map/SceneFooter.svelte';
  import { copyToClipboard } from '$lib/utils';
  import type { MapMouseEvent } from 'maplibre-gl';
  import {
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
    // copy coordinates to clipboard (lat-lon) (y-x)
    const coordinates = [event.lngLat.lat, event.lngLat.lng];
    copyToClipboard(coordinates.join(', '));
  }
</script>

<div class="top-left">
  <BellTowerLogo width="32" height="32" />
  <hr />
  <h1>Campus Map</h1>
</div>
<MapLibre
  bind:map
  class="map-container"
  bind:center
  bind:zoom
  style="http://localhost:3000/arcgis/rest/services/FurmanCampusMap/VectorTileServer/resources/styles/root.json"
  attributionControl={false}
  oncontextmenu={handleRightClick}
>
  <SceneFooter position="bottom-right" />
  <NavigationControl />
  <TerrainControl source="terrain" />
  <GlobeControl />
  <RasterTileSource
    tiles={['https://tile.openstreetmap.org/{z}/{x}/{y}.png']}
    maxzoom={19}
    attribution="&copy; OpenStreetMap contributors"
  >
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
  </RasterDEMTileSource>
  <RasterDEMTileSource
    tiles={['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']}
    minzoom={0}
    maxzoom={15}
    encoding="terrarium"
    attribution="<a href='https://github.com/tilezen/joerd/blob/master/docs/attribution.md'>Mapzen (Terrain)</a>"
  >
    <HillshadeLayer />
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

  .top-left {
    position: absolute;
    top: 0;
    left: 0;
    width: fit-content;
    z-index: 1;
    font-family: 'Brandon Grotesque', sans-serif;
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1rem;
    user-select: none;
  }

  .top-left hr {
    height: 1.5rem;
    border: none;
    border-left: 2px solid black;
    margin: 0;
  }

  .top-left h1 {
    font-weight: 700;
    font-size: 1.5rem;
    margin: 0;
    text-shadow: 0 0 2px #ffffff;
  }
</style>
