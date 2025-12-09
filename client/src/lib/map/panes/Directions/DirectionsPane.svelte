<script lang="ts">
  import { LeftPane } from '$lib/components';
  import { LngLat } from 'maplibre-gl';
  import { GeoJSONSource, getMapContext, LineLayer, Marker } from 'svelte-maplibre-gl';
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
    startLngLat?: maplibregl.LngLatLike;
    /**
     * The ending location for the route. Auto-populated based on user input.
     */
    endLngLat?: maplibregl.LngLatLike;
    /**
     * The GeoJSON representation of the solved route. Auto-populated after solving.
     */
    routeGeoJson?: GeoJSON.FeatureCollection<GeoJSON.Geometry> | null;
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
  }: DirectionsPaneProps = $props();

  const mapCtx = getMapContext();
  if (!mapCtx.map) throw new Error('Map instance is not initialized.');

  // track the state of the text boxes for start and end locations
  let startLocationInputText = $state('');
  let endLocationInputText = $state('');

  // convert the text box inputs into LngLatLike values
  function attemptConvertToLngLat(inputText: string | undefined): maplibregl.LngLatLike | undefined {
    if (!inputText) {
      return undefined;
    }

    try {
      // we assume that input is in "lng, lat" format,
      // but `LngLat.convert` will also throw an error if it is not
      return LngLat.convert(
        inputText.split(',').map((coord) => parseFloat(coord.trim())) as [number, number]
      );
    } catch {
      return undefined;
    }
  }
  $effect(() => {
    startLngLat = attemptConvertToLngLat(startLocationInputText);
  });
  $effect(() => {
    endLngLat = attemptConvertToLngLat(endLocationInputText);
  });

  // automatically solve the route when the start or end locations change
  $effect(() => {
    if (!mapCtx.map) {
      return;
    }

    if (!startLngLat || !endLngLat) {
      routeGeoJson = null;
      return;
    }

    solveRoute({ map: mapCtx.map, startLngLat, endLngLat })
      .then((geoJson) => {
        routeGeoJson = geoJson;
      })
      .catch((error) => {
        console.error('Error solving route:', error);
        routeGeoJson = null;
      });
  });

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
    function handleMapRightClick(event: maplibregl.MapMouseEvent) {
      const isLeftClick = event.originalEvent.button === 0;
      if (!isLeftClick) {
        return;
      }

      if (!startLngLat) {
        startLocationInputText = `${event.lngLat.lng}, ${event.lngLat.lat}`;
        return;
      }

      if (!endLngLat) {
        endLocationInputText = `${event.lngLat.lng}, ${event.lngLat.lat}`;
        return;
      }
    }

    mapCtx.map?.on('click', handleMapRightClick);
    return () => {
      mapCtx.map?.off('click', handleMapRightClick);
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
</script>

<LeftPane title="Directions" {mapFrameHeight} {mapFrameWidth} bind:minimized bind:open {visible}>
  <p>
    Right click the map to copy the coordinates of that location. Then, paste the coordinates into the boxes
    below.
  </p>
  <div><label for="start-location"> Start location </label></div>
  <input
    type="text"
    id="start-location"
    bind:value={startLocationInputText}
    placeholder="Click a location on the map"
  />
  <button onclick={() => (startLocationInputText = '')}>clear</button>
  <div><label for="end-location"> End location </label></div>
  <input
    type="text"
    id="end-location"
    bind:value={endLocationInputText}
    placeholder={startLngLat ? 'Click a location on the map' : ''}
  />
  <button onclick={() => (endLocationInputText = '')}>clear</button>

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
