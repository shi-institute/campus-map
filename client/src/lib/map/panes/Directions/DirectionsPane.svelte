<script lang="ts">
  import { LeftPane } from '$lib/components';
  import { routeBuilder } from '$lib/navigation';
  import { computeGeoJsonBounds, stringToLngLat } from '$lib/utils';
  import sha256 from '@cryptography/sha256';
  import { GeoJSONSource, getMapContext, LineLayer, Marker } from 'svelte-maplibre-gl';
  import type { SvelteURL } from 'svelte/reactivity';
  import { solveRoute } from './solveRoute';

  interface DirectionsPaneProps {
    mapFrameHeight: number;
    mapFrameWidth: number;
    /**
     * Whether this pane is minimized. Defaults to `false`.
     */
    minimized: boolean;
    /**
     * Whether this pane is open. Defaults to `true`.
     */
    open: boolean;
    /**
     * Whether this pane is visible. Defaults to `true`.
     */
    visible: boolean;
    /**
     * The starting location for the route. Auto-populated based on user input.
     */
    startLngLat?: maplibregl.LngLat;
    /**
     * The ending location for the route. Auto-populated based on user input.
     */
    endLngLat?: maplibregl.LngLat;
    /**
     * The GeoJSON representation of the solved route. Auto-populated after solving.
     */
    routeGeoJson?: GeoJSON.FeatureCollection<GeoJSON.Geometry> | null;
    /**
     * Fires when any prop changes, including internal state changes.
     */
    onChange?: (props: DirectionsPaneProps) => void;
    /**
     * Fires when a new directions URL is ready.
     */
    onNewUrl?: (url: SvelteURL) => void;
    /**
     * Fires when the pane is closed from within the pane.
     */
    onClose?: () => void;
  }

  let {
    mapFrameHeight,
    mapFrameWidth,
    minimized = $bindable(false),
    open = $bindable(true),
    visible = $bindable(true),
    startLngLat = $bindable(),
    endLngLat = $bindable(),
    routeGeoJson = $bindable(null),
    onChange,
    onNewUrl,
    onClose,
  }: DirectionsPaneProps = $props();

  const mapCtx = getMapContext();
  if (!mapCtx.map) throw new Error('Map instance is not initialized.');

  $effect(() => {
    onChange?.({
      mapFrameHeight,
      mapFrameWidth,
      minimized,
      open,
      visible,
      startLngLat,
      endLngLat,
      routeGeoJson,
    });
  });

  function pushNewUrl() {
    if (onNewUrl) {
      const directionsUrl = routeBuilder.buildDirectionsRoute({
        orderedStops: [
          startLngLat ? { label: 'Start', lngLat: startLngLat } : null,
          endLngLat ? { label: 'End', lngLat: endLngLat } : null,
        ],
        method: 'walking',
      });
      onNewUrl(directionsUrl);
    }
  }

  // track the state of the text boxes for start and end locations
  let startLocationInputText = $state<string>('');
  let endLocationInputText = $state<string>('');
  let startLocationInputFocused = $state<boolean>(false);
  let endLocationInputFocused = $state<boolean>(false);

  // if there is no text value, but the corresponding LngLat is set,
  // populate the text box with that value
  $effect(() => {
    if (startLocationInputText === '' && startLngLat && !startLocationInputFocused) {
      startLocationInputText = `${startLngLat.lat}, ${startLngLat.lng}`;
    }
  });
  $effect(() => {
    if (endLocationInputText === '' && endLngLat && !endLocationInputFocused) {
      endLocationInputText = `${endLngLat.lat}, ${endLngLat.lng}`;
    }
  });

  /**
   * Resolves the starting location input text into a LngLat object.
   */
  function resolveStart() {
    startLngLat = stringToLngLat(startLocationInputText, 'lat-lng');
    fitRouteToBounds();
    pushNewUrl();
  }

  /**
   * Resolves the ending location input text into a LngLat object.
   */
  function resolveEnd() {
    endLngLat = stringToLngLat(endLocationInputText, 'lat-lng');
    fitRouteToBounds();
    pushNewUrl();
  }

  function resetStart() {
    startLocationInputText = '';
    startLngLat = undefined;
    routeGeoJson = null;
    pushNewUrl();
  }

  function resetEnd() {
    endLocationInputText = '';
    endLngLat = undefined;
    routeGeoJson = null;
    pushNewUrl();
  }

  // automatically solve the route when the start or end locations change
  let geojsonHash = $derived(sha256(JSON.stringify(routeGeoJson), 'hex'));
  $effect(() => {
    if (!startLngLat || !endLngLat) {
      routeGeoJson = null;
      return;
    }

    solveRoute({ startLngLat, endLngLat })
      .then((geoJson) => {
        const newGeojsonHash = sha256(JSON.stringify(geoJson), 'hex');
        if (newGeojsonHash === geojsonHash) {
          return;
        }

        routeGeoJson = geoJson;

        // fit the map to the solved route
        fitRouteToBounds();
      })
      .catch((error) => {
        console.error('Error solving route:', error);
        routeGeoJson = null;
      });
  });

  function fitRouteToBounds() {
    const bounds = computeGeoJsonBounds(routeGeoJson);
    if (mapCtx.map && bounds && !bounds.isEmpty()) {
      mapCtx.map?.fitBounds(bounds, {
        padding: { top: 100, bottom: 100, left: 100 + mapOffsetX, right: 100 + mapOffsetX },
        animate: true,
        duration: 1000,
        offset: [mapOffsetX, 0],
      });
    }
  }

  // when the pane is open, expanded, and visible, support
  // clicking on the map to set start/end locations
  $effect(() => {
    if (!open || minimized || !visible) {
      return;
    }

    /**
     * Sets the start location based on a left click on the map
     * when the start location is not yet set. Otherwise, sets
     * the end location if it is not yet set.
     */
    function handleMapLeftClick(event: maplibregl.MapMouseEvent) {
      const isLeftClick = event.originalEvent.button === 0;
      if (!isLeftClick) {
        return;
      }

      if (!startLngLat) {
        startLocationInputText = `${event.lngLat.lat}, ${event.lngLat.lng}`;
        resolveStart();
        return;
      }

      if (!endLngLat) {
        endLocationInputText = `${event.lngLat.lat}, ${event.lngLat.lng}`;
        resolveEnd();
        return;
      }
    }

    mapCtx.map?.on('click', handleMapLeftClick);
    return () => {
      mapCtx.map?.off('click', handleMapLeftClick);
    };
  });

  // clear route information when the navigation pane is closed
  $effect(() => {
    if (!open) {
      startLocationInputText = '';
      endLocationInputText = '';
      routeGeoJson = null;
    }
  });

  let mapOffsetX = $state<number>(0);
</script>

<LeftPane
  title="Directions"
  {mapFrameHeight}
  {mapFrameWidth}
  bind:minimized
  bind:open
  {visible}
  bind:mapOffsetX
  {onClose}
>
  <p>
    Right click the map to copy the coordinates of that location. Then, paste the coordinates into the boxes
    below.
  </p>
  <div><label for="start-location"> Start location </label></div>
  <input
    type="text"
    id="start-location"
    bind:value={startLocationInputText}
    onfocus={() => (startLocationInputFocused = true)}
    onblur={() => (startLocationInputFocused = false)}
    onkeydown={(event) => {
      if (event.key === 'Enter') resolveStart();
    }}
    placeholder="Click a location on the map"
  />
  <button onclick={resolveStart}>find</button>
  <button onclick={resetStart}>clear</button>
  <div><label for="end-location"> End location </label></div>
  <input
    type="text"
    id="end-location"
    bind:value={endLocationInputText}
    onfocus={() => (endLocationInputFocused = true)}
    onblur={() => (endLocationInputFocused = false)}
    onkeydown={(event) => {
      if (event.key === 'Enter') resolveEnd();
    }}
    placeholder={startLngLat ? 'Click a location on the map' : ''}
  />
  <button onclick={resolveEnd}>find</button>
  <button onclick={resetEnd}>clear</button>

  <!-- show the start marker on the map -->
  {#if startLngLat}
    <Marker lnglat={startLngLat} color="green" />
  {/if}

  <!-- show the end marker on the map -->
  {#if endLngLat}
    <Marker lnglat={endLngLat} color="red" />
  {/if}

  <!-- show the solved route -->
  <GeoJSONSource id="solved-route-source" data={routeGeoJson ?? { type: 'FeatureCollection', features: [] }}>
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
