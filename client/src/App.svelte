<script lang="ts">
  import { LeftPane } from '$lib/components';
  import { LogoHeader, SceneFooter, ThemeSwitcher } from '$lib/map';
  import {
    copyToClipboard,
    implementPitchAndRollOnMiddleClickAndDrag,
    implementZoomOnRightClickAndDrag,
    isGeoJsonLineStringFeatureCollection,
  } from '$lib/utils';
  import { LngLat, type MapMouseEvent } from 'maplibre-gl';
  import {
    CustomControl,
    GeoJSONSource,
    LineLayer,
    MapLibre,
    Marker,
    NavigationControl,
    RasterDEMTileSource,
    RasterLayer,
    RasterTileSource,
    Terrain,
  } from 'svelte-maplibre-gl';

  let center = $state([-82.43915171317023, 34.92549441017741] as [number, number]); // New York City
  let zoom = $state(16);
  let map = $state<maplibregl.Map | undefined>(undefined);
  let mapFrameHeight = $state<number | undefined>(undefined);
  let mapFrameWidth = $state<number | undefined>(undefined);

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

  let solvedRouteGeoJson = $state<GeoJSON.FeatureCollection<GeoJSON.LineString> | null>(null);

  function solveRoute(
    map: maplibregl.Map,
    startLocationCoordinates: maplibregl.LngLatLike,
    endLocationCoordinates: maplibregl.LngLatLike
  ) {
    if (!startLocationCoordinates || !endLocationCoordinates || !map) {
      return;
    }

    const resolvedStart = LngLat.convert(startLocationCoordinates);
    const resolvedEnd = LngLat.convert(endLocationCoordinates);

    const startX = resolvedStart.lng;
    const startY = resolvedStart.lat;
    const endX = resolvedEnd.lng;
    const endY = resolvedEnd.lat;
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
          solvedRouteGeoJson = null;
          throw new Error('Invalid GeoJSON response');
        }
      })
      .then((geojson) => {
        solvedRouteGeoJson = geojson;
      });
  }

  // automatically solve the route when the start or end locations change
  $effect(() => {
    if (!map) {
      return;
    }

    if (!startLocationCoordinates || !endLocationCoordinates) {
      solvedRouteGeoJson = null;
      return;
    }

    solveRoute(map, startLocationCoordinates, endLocationCoordinates);
  });

  // handle map clicks to set start and end locations
  function handleClick(event: MapMouseEvent) {
    if (visiblePane !== 'navigation') {
      return;
    }

    panesAreMinimized = false;
    navigationPaneIsOpen = true;

    if (!startLocation) {
      startLocation = `${event.lngLat.lat}, ${event.lngLat.lng}`;
      return;
    }

    if (!endLocation) {
      endLocation = `${event.lngLat.lat}, ${event.lngLat.lng}`;
      return;
    }
  }

  // clear route information when the navigation pane is closed
  $effect(() => {
    if (!navigationPaneIsOpen) {
      startLocation = '';
      endLocation = '';
      solvedRouteGeoJson = null;
    }
  });

  let panesAreMinimized = $state(true);
  let searchPaneIsOpen = $state(true);
  let navigationPaneIsOpen = $state(false);

  let visiblePane = $derived.by(() => {
    // if the navigation pane is open, show it
    if (navigationPaneIsOpen) {
      return 'navigation';
    }

    // if the search pane is open, show it
    if (searchPaneIsOpen) {
      return 'search';
    }

    // otherwise, show nothing
    return null;
  });
</script>

<div
  class="map-frame"
  bind:clientHeight={mapFrameHeight}
  data-map-height={mapFrameHeight}
  bind:clientWidth={mapFrameWidth}
  data-map-width={mapFrameWidth}
>
  <MapLibre
    bind:map
    class="map-container"
    bind:center
    bind:zoom
    style="http://localhost:3000/arcgis/rest/services/FurmanCampusMap/VectorTileServer/resources/styles/root.json"
    attributionControl={false}
    oncontextmenu={handleRightClick}
    doubleClickZoom={false}
    dragPan={true}
    dragRotate={false}
    hash={true}
    maxPitch={85}
    autoloadGlobalCss={false}
    onload={(event) => {
      const map = event.target;

      // when zoomed out to world view, use globe projection
      map.setProjection({ type: 'globe' });

      // zoom in and out with right click and drag
      implementZoomOnRightClickAndDrag(map);

      // adjust pitch and roll with middle click and drag
      implementPitchAndRollOnMiddleClickAndDrag(map);
    }}
    onpitchend={(event) => {
      const map = event.target;

      // if the pitch is 0 degrees, remove terrain
      if (map.transform.pitch === 0) {
        if (map.getTerrain()) {
          map.setTerrain(null);
        }
        return;
      }

      // if the pitch is greater than 0 degrees, add terrain
      if (!map.getTerrain()) {
        // TODO: figure out why there are weird glitches when toggling terrain on and off
        // map.setTerrain({ source: 'terrain', exaggeration: 1.5 });
      }
    }}
    onclick={handleClick}
  >
    <LogoHeader />
    <CustomControl position="bottom-left" class="pane-control">
      <LeftPane
        title="Directions"
        {mapFrameHeight}
        {mapFrameWidth}
        bind:minimized={panesAreMinimized}
        bind:open={navigationPaneIsOpen}
        visible={visiblePane === 'navigation'}
      >
        <p>
          Right click the map to copy the coordinates of that location. Then, paste the coordinates into the
          boxes below.
        </p>
        <div><label for="start-location"> Start location </label></div>
        <input
          type="text"
          id="start-location"
          bind:value={startLocation}
          placeholder="Click a location on the map"
        />
        <button onclick={() => (startLocation = '')}>clear</button>
        <div><label for="end-location"> End location </label></div>
        <input
          type="text"
          id="end-location"
          bind:value={endLocation}
          placeholder={startLocationCoordinates ? 'Click a location on the map' : ''}
        />
        <button onclick={() => (endLocation = '')}>clear</button>

        <!-- show the start marker on the map -->
        {#if startLocationCoordinates}
          <Marker lnglat={startLocationCoordinates} color="green" />
        {/if}

        <!-- show the end marker on the map -->
        {#if endLocationCoordinates}
          <Marker lnglat={endLocationCoordinates} color="red" />
        {/if}

        <!-- show the solved route -->
        <GeoJSONSource
          id="solved-route-source"
          data={solvedRouteGeoJson ?? { type: 'FeatureCollection', features: [] }}
        >
          <LineLayer
            id="solved-route-outline"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{ 'line-color': '#010ed6', 'line-width': 10 }}
          />
          <LineLayer
            id="solved-route"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{ 'line-color': '#0d53ff', 'line-width': 6 }}
          />
        </GeoJSONSource>
      </LeftPane>

      <LeftPane
        title="Search"
        {mapFrameHeight}
        {mapFrameWidth}
        bind:minimized={panesAreMinimized}
        bind:open={searchPaneIsOpen}
        visible={visiblePane === 'search'}
        hideCloseButton
      >
        <button
          onclick={() => {
            visiblePane = 'navigation';
            navigationPaneIsOpen = true;
          }}
        >
          Get directions
        </button>
      </LeftPane>
    </CustomControl>
    <SceneFooter position="bottom-right" />
    <ThemeSwitcher position="bottom-right" />
    <NavigationControl position="top-right" />
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
      <!-- <Terrain /> -->
      <!-- TODO: enable hillshade when in hiking/trails mode -->
      <!-- <HillshadeLayer /> -->
    </RasterDEMTileSource>
  </MapLibre>
</div>

<style>
  /* always show the map on the full screen on the bottom layer */
  .map-frame {
    position: relative;
    block-size: 100%;
    inline-size: 100%;
    background-color: white;
  }
  .map-frame :global(.map-container) {
    position: absolute;
    inset: 0;
  }

  :global(.maplibregl-ctrl-bottom-left) {
    width: 100%;
    z-index: 3;
  }

  :global(.maplibregl-ctrl-bottom-left .pane-control) {
    position: relative;
    width: 100%;
  }

  :global(.maplibregl-ctrl-bottom-left .pane-control > aside) {
    position: absolute;
    bottom: 0;
  }
</style>
