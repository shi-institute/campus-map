<script lang="ts">
  import { LeftPane } from '$lib/components';
  import { routeBuilder, type FoundPlaceRoute } from '$lib/navigation';
  import { getLabelFromProperties, ReactiveMapSource, with_previous } from '$lib/utils';
  import { getMapContext, Marker } from 'svelte-maplibre-gl';
  import type { SvelteURL } from 'svelte/reactivity';
  import { findFeatureOnMap } from './findFeatureOnMap';

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
     * The place for which details will be shown.
     *
     * Retreive the place from the URL using the `$route` store
     * from '$lib/navigation', specifically `route.data` when `$route.type === 'place'`.
     */
    place: FoundPlaceRoute['data'] | null;
    /**
     * Fires when any prop changes, including internal state changes.
     */
    onChange?: (props: DirectionsPaneProps) => void;
    /**
     * Fires when a new directions URL is ready.
     */
    onNewUrl?: (url: SvelteURL, shouldReplace?: boolean) => Promise<boolean | void>;
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
    place,
    onChange,
    onNewUrl,
    onClose,
  }: DirectionsPaneProps = $props();

  const mapCtx = getMapContext();
  if (!mapCtx.map) throw new Error('Map instance is not initialized.');
  const featureSource = new ReactiveMapSource(mapCtx.map, 'esri');

  $effect(() => {
    onChange?.({ mapFrameHeight, mapFrameWidth, minimized, open, visible, place });
  });

  /**
   * Triggers the onNewUrl callback with a directions URL pre-filled to the given centroid.
   *
   * The consumer of this component is expected to handle the navigation.
   */
  async function gotoDirections(centroid?: maplibregl.LngLat) {
    if (!onNewUrl) {
      return false;
    }

    const directionsUrl = routeBuilder.buildDirectionsRoute({
      // pre-fill the end location with the selected place centroid
      orderedStops: centroid
        ? [
            null, // leave start location empty
            { label: 'End', lngLat: centroid },
          ]
        : [],
      method: 'walking',
    });

    const result = await onNewUrl(directionsUrl, false);
    if (result === false) {
      // navigation was cancelled by the consumer
      return false;
    }

    return true;
  }

  // Gets the feature on the map for the selected place.
  // If the the map is loading, or if the feature is unloaded
  // because it is off-screen, the previously found feature
  // will be re-used unless is corresponds to a different place.
  const placeFeature = $derived.by(
    with_previous(
      (previous) => {
        if (!place) {
          return null;
        }

        // check if the current place matches the previous place
        const currentPlaceMatchesPreviousPlace =
          previous && previous.layerId === place.layerId && previous.id === place.featureId;

        // if the map style is not loaded yet, fall back to previous value
        if (!featureSource.loaded) {
          if (currentPlaceMatchesPreviousPlace) return previous;
          return null;
        }

        const found = findFeatureOnMap<{ layerId: string; label: string; labelField: string }>({
          map: mapCtx.map,
          layerId: place.layerId,
          featureId: place.featureId,
        });

        // if the feature was not found on the map (e.g., off-screen), fall back to previous value
        if (!found) {
          if (currentPlaceMatchesPreviousPlace) return previous;
          return null;
        }

        // attach layerId for later reference
        found.layerId = place.layerId;

        // attach a label for convenience
        const [label, labelField] = getLabelFromProperties(found.properties, 'Unknown location');
        found.label = label;
        found.labelField = labelField ?? undefined;

        return found;
      },

      // initial value
      null as ReturnType<typeof findFeatureOnMap<{ layerId: string; label: string; labelField: string }>>
    )
  );

  let mapOffsetX = $state<number>(0);
</script>

<LeftPane
  title={placeFeature?.label ?? 'Location details'}
  {mapFrameHeight}
  {mapFrameWidth}
  bind:minimized
  bind:open
  {visible}
  bind:mapOffsetX
  {onClose}
>
  <h2>Directions</h2>
  <button
    onclick={() => {
      // navigate to the directions pane with the place as the destination
      gotoDirections(place?.centroid).then((navigated) => {
        if (navigated && mapCtx.map && place?.centroid) {
          // center the map on the place centroid is navigation proceeded
          mapCtx.map.setCenter(place.centroid, { animate: true });
        }
      });
    }}
  >
    Get directions
  </button>

  <h2>Type</h2>
  <p>{placeFeature?.geometry.type ?? 'N/A'}</p>

  <h2>id</h2>
  <p>{placeFeature?.id ?? 'N/A'}</p>

  <h2>label field</h2>
  <p>{placeFeature?.labelField ?? 'N/A'}</p>

  <h2>properties</h2>
  <pre>{JSON.stringify(placeFeature?.properties ?? {}, null, 2)}</pre>

  {#if place?.centroid}
    <Marker lnglat={place.centroid} color="orange" />
  {/if}
</LeftPane>
