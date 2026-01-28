<script lang="ts">
  import { LeftPane } from '$lib/components';
  import { LogoHeader, Panes, SceneFooter, ThemeSwitcher } from '$lib/map';
  import Editor from '$lib/map/editor/Editor.svelte';
  import { goBack, goto, route, url } from '$lib/navigation';
  import { rootStyleToPrintStyle } from '$lib/styles/printMapStyles';
  import {
    copyToClipboard,
    getLabelFromProperties,
    implementPitchAndRollOnMiddleClickAndDrag,
    implementZoomOnRightClickAndDrag,
    queryFeatureServices,
    useAsync,
  } from '$lib/utils';
  import { centroid as computeCentroid } from '@turf/centroid';
  import { type MapMouseEvent } from 'maplibre-gl';
  import { onMount, untrack } from 'svelte';
  import {
    BackgroundLayer,
    CustomControl,
    MapLibre,
    NavigationControl,
    RasterDEMTileSource,
    RasterLayer,
    RasterTileSource,
    RawLayer,
  } from 'svelte-maplibre-gl';

  let center = $state([-82.43915171317023, 34.92549441017741] as [number, number]); // New York City
  let zoom = $state(16);
  let map = $state<maplibregl.Map | undefined>(undefined);
  let mapFrameHeight = $state<number | undefined>(undefined);
  let mapFrameWidth = $state<number | undefined>(undefined);
  let mapLoadedOnce = $state(false);

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
        const [label] = getLabelFromProperties(feature.properties, 'Unnamed feature');

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

  // when the place changes, center the map on the place centroid
  $effect(() => {
    if (place?.centroid) {
      untrack(() => {
        center = [place.centroid.lng, place.centroid.lat];
      });
    }
  });

  let rootStyleData = $state<maplibregl.StyleSpecification>();
  let rootStyleLoading = $state(true);
  let rootStyleError = $state<Error | null>(null);
  $effect(() => {
    const url = `${import.meta.env.VITE_MAP_SERVER_URL}/rest/services/FurmanCampusMap/VectorTileServer/resources/styles/root.json`;
    rootStyleLoading = true;
    rootStyleError = null;
    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch map style: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then((data) => {
        rootStyleData = data;
      })
      .catch((error) => {
        rootStyleError = error;
      })
      .finally(() => {
        rootStyleLoading = false;
      });
  });

  let printMapStyle = $state<maplibregl.StyleSpecification>();
  $effect(() => {
    printMapStyle = rootStyleToPrintStyle(rootStyleData);
  });

  const selectedStyleName = $state<string>($url.searchParams.get('style') || 'print');
  const selectedStyleData = $derived(getStyle($url.searchParams.get('style')));

  function getStyle(name: string | null) {
    if (name === 'print' && printMapStyle) {
      return { ...printMapStyle, name: 'print' };
    }

    if (!rootStyleData) {
      return undefined;
    }
    return { ...rootStyleData, name: 'default' };
  }

  let editModeEnabled = $state($url.searchParams.get('edit') === 'true');

  // keep the url in sync with edit mode
  $effect(() => {
    const newUrl = new URL($url.href);
    newUrl.hash = window.location.hash; // preserve the hash
    if (editModeEnabled) {
      newUrl.searchParams.set('edit', 'true');
    } else {
      newUrl.searchParams.delete('edit');
    }
    goto(newUrl.href, true);
  });
</script>

<div
  class="map-frame"
  bind:clientHeight={mapFrameHeight}
  data-map-height={mapFrameHeight}
  bind:clientWidth={mapFrameWidth}
  data-map-width={mapFrameWidth}
>
  {#if rootStyleData}
    <MapLibre
      bind:map
      class="map-container"
      bind:center
      bind:zoom
      style={rootStyleData}
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

        mapLoadedOnce = true;
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
      {#if editModeEnabled}
        <Editor />
      {/if}
      <CustomControl position="bottom-left" class="pane-control">
        <Panes.Directions
          {mapFrameHeight}
          {mapFrameWidth}
          bind:minimized={panesAreMinimized}
          bind:open={directionsPaneIsOpen}
          visible={visiblePane === 'navigation'}
          bind:startLngLat={directionsStartLngLat}
          bind:endLngLat={directionsEndLngLat}
          onNewUrl={async (url, shouldReplace) => {
            goto(url, shouldReplace);
          }}
          onClose={() => goBack()}
        />

        <Panes.Place
          {mapFrameHeight}
          {mapFrameWidth}
          bind:minimized={panesAreMinimized}
          bind:open={placePaneIsOpen}
          visible={visiblePane === 'place'}
          {place}
          onNewUrl={async (url, shouldReplace) => {
            goto(url, shouldReplace);
          }}
          onClose={() => goBack()}
        />

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

      <BackgroundLayer id="background" paint={{ 'background-color': 'rgba(0,0,0,0)' }} />

      <SceneFooter position="bottom-right" bind:editModeEnabled />
      <ThemeSwitcher position="bottom-right" />
      <NavigationControl position="top-right" />
      <RasterTileSource
        tiles={['https://tile.openstreetmap.org/{z}/{x}/{y}.png']}
        maxzoom={19}
        attribution="&copy; OpenStreetMap contributors"
      >
        <!-- show the raster tiles before the first layer in the vector tiles, which ensures it is the bottom layer (basemap) -->
        <RasterLayer paint={{ 'raster-opacity': 0.2 }} />
      </RasterTileSource>

      {#each selectedStyleData?.layers.filter((layer) => layer.type === 'line') as layer}
        {@const key = layer.source + '-' + layer['source-layer'] + '-' + layer.id}
        {#key key}
          <RawLayer
            type={layer.type}
            source={layer.source}
            source-layer={layer['source-layer']}
            filter={layer.filter}
            layout={layer.layout}
            paint={layer.paint}
            maxzoom={layer.maxzoom}
            minzoom={layer.minzoom}
            metadata={layer.metadata}
            id={layer.id}
          />
        {/key}
      {/each}

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
  {/if}
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

  :global(.maplibregl-ctrl-top-left, .maplibregl-ctrl-top-right) {
    top: var(--map-top-offset, 0px);
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

  @media print {
    :global(.maplibregl-control-container) {
      display: none;
    }

    .map-frame :global(.map-container) {
      position: absolute;
      inset: 0;
      max-width: 8.5in;
      max-height: 11in;
    }
  }
</style>
