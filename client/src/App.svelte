<script lang="ts">
  import { LeftPane } from '$lib/components';
  import { LogoHeader, Panes, SceneFooter, ThemeSwitcher } from '$lib/map';
  import { goBack, goto, historyStack, route, routeBuilder, url } from '$lib/navigation';
  import {
    copyToClipboard,
    implementPitchAndRollOnMiddleClickAndDrag,
    implementZoomOnRightClickAndDrag,
    queryFeatureServices,
    useAsync,
    with_previous,
  } from '$lib/utils';
  import { centroid as computeCentroid } from '@turf/centroid';
  import { GeoJSONFeature, type MapMouseEvent } from 'maplibre-gl';
  import { onMount, untrack } from 'svelte';
  import {
    CustomControl,
    MapLibre,
    Marker,
    NavigationControl,
    RasterDEMTileSource,
    RasterLayer,
    RasterTileSource,
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

  let searchBoxValue = $state('');
  const searchResult = useAsync(async (abortSignal, skip) => {
    if (!searchBoxValue) {
      return skip('andClear'); //  prohibits further processing and will clear searchResult.value
    }

    const resultRecordCount = 10;

    return queryFeatureServices(
      {
        __default: { resultRecordCount, where: `Name LIKE '%${searchBoxValue}%'` },
        Trails: { resultRecordCount, where: `label LIKE '%${searchBoxValue}%'` },
      },
      {
        // sort result in descending order by layer name
        order(a, b) {
          return b.layerId.localeCompare(a.layerId);
        },
        abortSignal,
      }
    ).then((featureCollection) => {
      const processedFeatures = featureCollection.features.map((feature) => {
        // compute centroids for all features (lines, points, and polygons)
        const centroid = computeCentroid(feature);

        // compute a label for the feature
        const label = (
          feature.properties?.Name ||
          feature.properties?.label ||
          feature.properties?.LABEL ||
          feature.properties?.name ||
          'Unnamed Feature'
        ).toString();

        const pathname = `/place/${feature.properties.__layerId}/${feature.id}/@${centroid.geometry.coordinates[1]},${centroid.geometry.coordinates[0]}/`;

        return {
          ...feature,
          properties: {
            ...feature.properties,
            __centroid: centroid.geometry.coordinates,
            __label: label,
            __pathname: pathname,
          },
        };
      });

      return { ...featureCollection, features: processedFeatures };
    });
  });

  let panesAreMinimized = $state(true);
  let directionsPaneIsOpen = $derived(false);
  let placePaneIsOpen = $state(false);

  let visiblePane = $derived.by(() => {
    // if the navigation pane is open, show it
    if ($route.type === 'directions') {
      return 'navigation';
    }

    // if there is a selected place, show the place pane
    if ($route.type === 'place') {
      return 'place';
    }

    // otherwise, show the search pane
    return 'search';
  });

  // if there is a place selected, ensure the place pane is open
  $effect(() => {
    if ($route.type === 'place') {
      placePaneIsOpen = true;
    }
  });

  // if the directions URL is active, ensure the directions pane is open
  $effect(() => {
    if ($route.type === 'directions') {
      directionsPaneIsOpen = true;
    }
  });

  onMount(() => {
    if (visiblePane !== 'search') {
      panesAreMinimized = false;
    } else {
      panesAreMinimized = true;
    }
  });

  let directionsStartLngLat = $derived(
    $route.type === 'directions' ? $route.data.orderedStops[0]?.lngLat : undefined
  );
  let directionsEndLngLat = $derived(
    $route.type === 'directions' ? $route.data.orderedStops[1]?.lngLat : undefined
  );

  // get the place from the URL
  const place = $derived($route.type === 'place' ? $route.data : null);

  // const place = $derived.by(
  //   with_previous(
  //     (previous) => {
  //       // match /place/:layerId/:featureId/@:lat,:lon/
  //       const parts = $url.pathname.split('/');
  //       if (parts.length < 5 || parts[1] !== 'place' || !parts[4].startsWith('@')) {
  //         return null;
  //       }

  //       // get the layer id
  //       const layerId = decodeURIComponent(parts[2]);
  //       if (!layerId) {
  //         return null;
  //       }

  //       // get the feature id
  //       const featureIdPart = decodeURIComponent(parts[3]);
  //       if (!featureIdPart) {
  //         return null;
  //       }
  //       const featureId = isNaN(Number(featureIdPart)) ? featureIdPart : Number(featureIdPart);

  //       // get the centroid
  //       const coordsPart = parts[4].substring(1); // remove '@'
  //       const coords = coordsPart.split(',').map((part) => parseFloat(part.trim()));
  //       if (coords.length !== 2 || coords.some(isNaN)) {
  //         return null;
  //       }
  //       const centroidLatLong = [coords[1], coords[0]] as [number, number];

  //       // only return a new data obhect if it has changed
  //       const isCentroidChanged =
  //         !previous ||
  //         previous.centroid[0] !== centroidLatLong[0] ||
  //         previous.centroid[1] !== centroidLatLong[1];
  //       const isDifferentThanPreviousValue =
  //         isCentroidChanged || previous.layerId !== layerId || previous.featureId !== featureId;
  //       if (!isDifferentThanPreviousValue) {
  //         return previous;
  //       }

  //       return { centroid: centroidLatLong, layerId, featureId };
  //     },
  //     undefined as undefined | { centroid: [number, number]; layerId: string; featureId: number | string }
  //   )
  // );

  // center on the place centroid when it changes
  $effect(() => {
    if (place?.centroid) {
      untrack(() => {
        center = [place.centroid.lng, place.centroid.lat];
      });
    }
  });

  let mapStyleReady = $state(false);

  function findFeatureOnMap(layerId: string, featureId: number | string) {
    if (!map) {
      return;
    }

    const style = map.getStyle();
    if (!style) {
      throw new Error('Map style is not loaded yet.');
    }

    const layers = style.layers.filter((layerSpec) => 'source' in layerSpec && layerSpec.source === 'esri');
    for (const layer of layers) {
      if (layer.id.toLowerCase() !== layerId.toLowerCase()) {
        continue;
      }

      const features = map.querySourceFeatures('esri', { sourceLayer: layer.id });
      for (const feature of features) {
        if (feature.id === featureId) {
          return feature;
        }
      }
    }

    console.warn(`Feature not found on map: layerId=${layerId}, featureId=${featureId}`);
    return null;
  }

  // get the feature based on the selected place
  const placeFeature = $derived.by(
    with_previous(
      (previous) => {
        const currentPlaceMatchesPreviousPlace =
          previous && place && previous.layerId === place.layerId && previous.id === place.featureId;

        if (!place || !mapStyleReady || mapDataLoading) {
          // fall back to previous value if the place is the same
          if (currentPlaceMatchesPreviousPlace) return previous;
          return null;

          return previous;
        }

        const found: (GeoJSONFeature & { layerId?: string }) | null | undefined = findFeatureOnMap(
          place.layerId,
          place.featureId
        );
        if (!found) {
          if (currentPlaceMatchesPreviousPlace) return previous;
          return null;
        }

        // attach layerId for later reference
        found.layerId = place.layerId;

        return found;
      },
      null as null | (GeoJSONFeature & { layerId?: string })
    )
  );

  let mapDataLoading = $state(false);
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
    style={`${import.meta.env.VITE_MAP_SERVER_URL}/rest/services/FurmanCampusMap/VectorTileServer/resources/styles/root.json`}
    attributionControl={false}
    oncontextmenu={handleRightClick}
    doubleClickZoom={false}
    dragPan={true}
    dragRotate={false}
    hash={true}
    maxPitch={85}
    autoloadGlobalCss={false}
    onstyledata={() => {
      mapStyleReady = true;
    }}
    ondataloading={() => {
      mapDataLoading = true;
    }}
    onidle={() => {
      mapDataLoading = false;
    }}
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
  >
    <LogoHeader />
    <CustomControl position="bottom-left" class="pane-control">
      <Panes.Directions
        {mapFrameHeight}
        {mapFrameWidth}
        bind:minimized={panesAreMinimized}
        bind:open={directionsPaneIsOpen}
        visible={visiblePane === 'navigation'}
        bind:startLngLat={directionsStartLngLat}
        bind:endLngLat={directionsEndLngLat}
        onNewUrl={(url) => {
          goto(url, true);
        }}
        onClose={() => goBack()}
      />

      <LeftPane
        title="Place Information"
        {mapFrameHeight}
        {mapFrameWidth}
        bind:minimized={panesAreMinimized}
        bind:open={placePaneIsOpen}
        visible={visiblePane === 'place'}
        onClose={() => goBack()}
      >
        <h2>Directions</h2>
        <button
          onclick={() => {
            visiblePane = 'navigation';
            directionsPaneIsOpen = true;

            // center the map on the place centroid
            if (place?.centroid) {
              map?.setCenter(place.centroid, { animate: true });
            }

            // open the directions pane
            const directionsUrl = routeBuilder.buildDirectionsRoute({
              // pre-fill the end location with the selected place centroid
              orderedStops: place?.centroid
                ? [
                    null, // leave start location empty
                    { label: 'End', lngLat: place.centroid },
                  ]
                : [],
              method: 'walking',
            });
            goto(directionsUrl);
          }}
        >
          Get directions
        </button>

        <h2>Type</h2>
        <p>{placeFeature?.geometry.type ?? 'N/A'}</p>

        <h2>id</h2>
        <p>{placeFeature?.id ?? 'N/A'}</p>

        <h2>properties</h2>
        <pre>{JSON.stringify(placeFeature?.properties ?? {}, null, 2)}</pre>

        {#if place?.centroid}
          <Marker lnglat={place.centroid} color="orange" />
        {/if}
      </LeftPane>

      <LeftPane
        title="Search"
        {mapFrameHeight}
        {mapFrameWidth}
        bind:minimized={panesAreMinimized}
        open
        visible={visiblePane === 'search'}
        hideCloseButton
        style="user-select: none;"
      >
        <p>Search for features on the map (e.g., buildings, trails, points of interest).</p>
        <input type="text" placeholder="Search..." bind:value={searchBoxValue} />
        <button onclick={() => (searchBoxValue = '')}>clear</button>

        <p>Or get directions:</p>
        <button
          onclick={() => {
            visiblePane = 'navigation';
            directionsPaneIsOpen = true;
          }}
        >
          Get directions
        </button>

        <h2>
          Results
          {#if searchResult.isPending}
            ⧗
          {/if}
        </h2>

        {#if searchResult.value}
          <p>Found {searchResult.value.features.length} result(s).</p>

          <ul>
            {#each searchResult.value.features as feature}
              <li>
                <a
                  href={feature.properties.__pathname}
                  onclick={(event) => {
                    event.preventDefault();
                    goto(feature.properties.__pathname);
                  }}
                >
                  From <strong>{feature.properties.__layerId}</strong>:
                  {feature.properties.__label}
                  {feature.properties.__centroid
                    ? ` (Centroid: ${feature.properties.__centroid[1].toFixed(6)}, ${feature.properties.__centroid[0].toFixed(6)})`
                    : ''}
                </a>
              </li>
            {/each}
          </ul>
        {:else if searchResult.error}
          <p>
            Error performing search: {searchResult.error instanceof Error
              ? searchResult.error.message
              : searchResult.error}
          </p>
        {:else if searchResult.isPending}
          <p>Searching...</p>
        {:else if !searchBoxValue}
          <p>Enter a search term to see results.</p>
        {/if}
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
