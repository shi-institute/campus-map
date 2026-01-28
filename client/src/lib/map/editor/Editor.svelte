<script lang="ts">
  import { with_previous } from '$lib/utils';
  import { TerraDraw } from '@svelte-maplibre-gl/terradraw';
  import { onDestroy, onMount, tick } from 'svelte';
  import { FillLayer, GeoJSONSource, getMapContext, LineLayer, Marker } from 'svelte-maplibre-gl';
  import type { TerraDraw as Draw, TerraDrawEventListeners } from 'terra-draw';
  import {
    TerraDrawAngledRectangleMode,
    TerraDrawCircleMode,
    TerraDrawFreehandMode,
    TerraDrawLineStringMode,
    TerraDrawPointMode,
    TerraDrawPolygonMode,
    TerraDrawSelectMode,
  } from 'terra-draw';
  import { EditorDoc } from './editorDoc';
  import {
    convertMapFeatureToTerraDrawOnClick,
    getValidLayerTypes,
    parseFeatureId,
    recordAddition,
    recordDeletions,
    recordModification,
    resetFeature,
  } from './terra-draw';

  const mapCtx = getMapContext();
  if (!mapCtx.map) throw new Error('Map instance is not initialized.');

  const editorDoc = new EditorDoc('test-room');
  onDestroy(() => {
    editorDoc.destroy();
  });
  onMount(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      editorDoc.destroy();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  });
  // $inspect(editorDoc.trackedEdits.json);

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
      pointerDistance: 5,
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

  const selectionIsModifiedFeature = $derived.by(() => {
    if (selected === null || !draw) {
      return false;
    }
    const { layerId, featureId } = parseFeatureId(selected);

    return editorDoc.trackedEdits[layerId]?.modifiedIds.includes(featureId);
  });

  // keep the awareness updated with user's selected feature
  $effect(() => {
    if (
      !draw ||
      typeof selected === 'number' ||
      (editorDoc.awareness.localUser.selectedLayerFeatureId ?? null) === selected
    ) {
      return;
    }
    editorDoc.awareness.localUser = {
      ...editorDoc.awareness.localUser,
      selectedLayerFeatureId: selected ?? undefined,
    };
  });

  // keep the awareness updated with the current mouse cursor lat-long position on the map
  $effect(() => {
    if (!mapCtx.map) {
      return;
    }

    function updateCursorLatLng(event: maplibregl.MapMouseEvent) {
      const lngLat = event.lngLat;
      editorDoc.awareness.localUser = { ...editorDoc.awareness.localUser, lngLat };
    }

    mapCtx.map.on('mousemove', updateCursorLatLng);
    return () => {
      if (!mapCtx.map) {
        return;
      }
      mapCtx.map.off('mousemove', updateCursorLatLng);
    };
  });

  // get the layer names present on the vector tile layer
  const layerTypes = getValidLayerTypes(mapCtx);

  let layerForNewFeatures = $state<(typeof layerTypes)[number]>();

  // convert features to Terra Draw features on click
  $effect(() => {
    if (draw?.enabled) {
      convertMapFeatureToTerraDrawOnClick(mapCtx, editorDoc, draw);
    }
  });

  // save features in the store so they can be restored if this
  // component is unmounted and remounted
  const recordFeatures = ((featureIds, type, context) => {
    recordDeletions(editorDoc, featureIds, type, context);
  }) satisfies TerraDrawEventListeners['change'];

  /**
   * Handle finishing editing a feature.
   *
   * This function runs when the user finishes creating or editing a feature.
   */
  const handleFinish = ((id, context) => {
    mode = 'select';
    if (!draw) {
      return;
    }

    // if this is a new feature, record its addition and do nothing more
    if (layerForNewFeatures && recordAddition(editorDoc, draw, id, context, layerForNewFeatures.id)) {
      return;
    }

    recordModification(editorDoc, draw, id);

    // toggle the feature's selection so that other users are notified of the change
    const currentSelection = $state.snapshot(selected);
    if (currentSelection === id) {
      selected = null;
      tick().then(() => {
        selected = currentSelection;
      });
    }
  }) satisfies TerraDrawEventListeners['finish'];

  // tell the app to offset the top map controls by the height of the
  // edit controls when the editor is mounted
  onMount(() => {
    document.documentElement.style.setProperty('--map-top-offset', '68px');
    return () => {
      document.documentElement.style.removeProperty('--map-top-offset');
    };
  });

  let isDrawReady = $state(false);
  $effect(() => {
    if (!draw) {
      return;
    }
    if (!isDrawReady && draw.enabled) {
      isDrawReady = true;
    }
    if (isDrawReady && !draw.enabled) {
      isDrawReady = false;

      // keep checking until draw is re-enabled
      let timeToWait = 100;
      const interval = setInterval(() => {
        if (draw && draw.enabled) {
          isDrawReady = true;
          clearInterval(interval);
        } else {
          timeToWait *= 2; // exponential backoff
        }
      }, timeToWait);
    }
  });

  $effect(() => {
    if (editorDoc.ready && isDrawReady) {
      mapCtx.waitForStyleLoaded(() => {
        if (draw && draw.enabled) {
          editorDoc.trackedEdits.sync(draw, mapCtx);
        }
      });
    }
  });

  function isControlDisabled(modeName: string) {
    if (!layerForNewFeatures) {
      return modeName !== 'select';
    }

    if (layerForNewFeatures.type === 'Point') {
      return !['select', 'point'].includes(modeName);
    }

    if (layerForNewFeatures.type === 'LineString') {
      return !['select', 'linestring'].includes(modeName);
    }

    if (layerForNewFeatures.type === 'Polygon') {
      return !['select', 'polygon', 'angled-rectangle', 'circle', 'freehand'].includes(modeName);
    }

    return modeName !== 'select';
  }

  const globallySelected = $derived.by(() => {
    if (!draw) {
      return { ourSelectedFeatures: [], theirSelectedFeatures: [] };
    }

    const { ourIds, theirIds } = editorDoc.awareness.globalSelectedLayerFeatureIds;
    if (ourIds.length === 0 && theirIds.length === 0) {
      return { ourSelectedFeatures: [], theirSelectedFeatures: [] };
    }

    const snapshot = draw.getSnapshot();
    const ourSelectedFeatures = snapshot.filter((feature) => ourIds.includes(feature.id as string));
    const theirSelectedFeatures = snapshot.filter((feature) => theirIds.includes(feature.id as string));
    return { ourSelectedFeatures, theirSelectedFeatures };
  });
  // svelte-ignore state_referenced_locally
  const ourSelectedFeatures = $derived.by(
    with_previous((prev) => {
      const isEqual =
        prev.length === globallySelected.ourSelectedFeatures.length &&
        prev.every((feature, index) => feature.id === globallySelected.ourSelectedFeatures[index].id);
      if (isEqual) {
        return prev;
      }
      return globallySelected.ourSelectedFeatures;
    }, globallySelected.ourSelectedFeatures)
  );
  // svelte-ignore state_referenced_locally
  const theirSelectedFeatures = $derived.by(
    with_previous((prev) => {
      if (
        prev.length === globallySelected.theirSelectedFeatures.length &&
        prev.every((feature, index) => feature.id === globallySelected.theirSelectedFeatures[index].id)
      ) {
        return prev;
      }
      return globallySelected.theirSelectedFeatures;
    }, globallySelected.theirSelectedFeatures)
  );
</script>

<TerraDraw
  {mode}
  {modes}
  bind:draw
  onchange={recordFeatures}
  onselect={(featureId) => {
    // if the feature is selected by another user, immediately deselect it
    const selectedByAnotherUser = editorDoc.awareness.users.find(
      (user) =>
        user.selectedLayerFeatureId === featureId && user.clientId !== editorDoc.awareness.localUser.clientId
    );
    if (selectedByAnotherUser) {
      setTimeout(() => {
        draw?.deselectFeature(featureId);
      }, 0);
    }

    selected = featureId;
  }}
  ondeselect={() => (selected = null)}
  onfinish={handleFinish}
  onready={() => {
    console.log('TerraDraw ready, syncing tracked edits to map');
  }}
  idStrategy={{
    isValidId: (id) => {
      try {
        parseFeatureId(id);
        return true;
      } catch {
        return false;
      }
    },
    getId: (() => {
      let _lastMinId = -1;
      return () => {
        return `${_lastMinId--}.terra-draw`;
      };
    })(),
  }}
/>

<!-- show a layer with a teal background to highlight our selected features -->
{#key ourSelectedFeatures}
  <GeoJSONSource
    data={{
      type: 'FeatureCollection',
      features: ourSelectedFeatures.filter(
        (feature) => feature.geometry.type === 'Polygon' || feature.geometry.type === 'LineString'
      ),
    }}
    maxzoom={24}
  >
    <LineLayer
      beforeId="background"
      id="our-selection-layer"
      paint={{ 'line-color': '#40ffff', 'line-width': 10 }}
      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
    />
  </GeoJSONSource>
{/key}

<!-- show a layer with a red background to highlight their select features -->
{#key theirSelectedFeatures}
  <GeoJSONSource
    data={{
      type: 'FeatureCollection',
      features: theirSelectedFeatures.filter(
        (feature) => feature.geometry.type === 'Polygon' || feature.geometry.type === 'LineString'
      ),
    }}
    maxzoom={24}
  >
    <LineLayer
      beforeId="background"
      id="their-selection-layer"
      paint={{ 'line-color': '#e042ff', 'line-width': 10, 'line-opacity': 0.8 }}
      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
    />
  </GeoJSONSource>
  <GeoJSONSource
    data={{
      type: 'FeatureCollection',
      features: theirSelectedFeatures.filter((feature) => feature.geometry.type === 'Polygon'),
    }}
    maxzoom={24}
  >
    <FillLayer id="their-selection-fill-layer" paint={{ 'fill-opacity': 0 }} />
  </GeoJSONSource>
{/key}

<!-- Draw controls -->
<div class="controls">
  <div class="menubar">
    <strong>Edit</strong>
    {#if editorDoc.awareness.users}
      <div class="active-users">
        <strong>Active Users:</strong>
        {#each editorDoc.awareness.users as user (user.clientId)}
          <span style="color: {user.color}">{user.name || 'Anonymous'}</span>{' '}
        {/each}
        {#each editorDoc.awareness.cursors as cursor (cursor.clientId)}
          <Marker lnglat={cursor.lngLat} color={cursor.color}>
            {#snippet content()}
              <svg
                width="24"
                height="24"
                xmlns="http://www.w3.org/2000/svg"
                style="transform: translate(12px, 12px)"
                viewBox="0 0 32 32"
              >
                <path
                  d="m 2.5822892,0.2199333 c 0.095136,0.03454 0.095136,0.03454 0.1921935,0.0697777 0.2031462,0.074325 0.4056094,0.15027182 0.6079247,0.22682771 0.065206,0.0246458 0.1304118,0.0492916 0.1975936,0.0746842 0.4112515,0.15621308 0.8212891,0.31544505 1.2309595,0.47575299 0.3927914,0.1536824 0.7859253,0.3064856 1.1789952,0.4594541 0.081405,0.031707 0.1628101,0.063414 0.246682,0.096082 0.8771246,0.3414953 1.7556095,0.6794278 2.6342593,1.0169762 0.1596231,0.061344 0.3192454,0.1226886 0.478867,0.184035 0.3206342,0.1232174 0.6412779,0.2464112 0.961926,0.3695926 0.716627,0.275324 1.433131,0.5509705 2.149643,0.8265927 0.397306,0.1528288 0.794619,0.3056366 1.191932,0.4584466 0.158953,0.061136 0.317907,0.1222723 0.476861,0.1834081 0.07868,0.030262 0.157364,0.060525 0.238431,0.091704 8.345072,3.2096433 8.345072,3.2096433 8.583464,3.3013327 0.15908,0.061185 0.318161,0.1223692 0.477242,0.1835542 0.395445,0.152093 0.790888,0.3041897 1.18633,0.4562938 0.738381,0.2840098 1.476774,0.5679858 2.215213,0.8518466 0.345093,0.1326591 0.69018,0.2653366 1.035266,0.3980155 0.162963,0.06265 0.325928,0.125291 0.488898,0.187922 0.115416,0.04436 0.115416,0.04436 0.233165,0.08961 0.07507,0.02884 0.150138,0.05769 0.227483,0.0874 0.145844,0.05612 0.291643,0.11235 0.437394,0.168708 0.332674,0.128605 0.665679,0.25584 1.00034,0.37919 0.06027,0.02254 0.12054,0.04508 0.182636,0.06831 0.110443,0.04126 0.221133,0.08187 0.332127,0.121635 0.475257,0.179079 0.855643,0.442617 1.097007,0.908107 0.148888,0.409057 0.186903,0.854961 0.05101,1.271534 -0.06591,0.140995 -0.06591,0.140995 -0.142141,0.275112 -0.02364,0.04275 -0.04728,0.08549 -0.07164,0.129532 -0.229601,0.328849 -0.544408,0.488665 -0.897554,0.659983 -0.07771,0.03823 -0.07771,0.03823 -0.156982,0.07724 -0.505203,0.246371 -1.017924,0.474843 -1.532916,0.699849 -1.039702,0.454652 -2.071506,0.925044 -3.09992,1.404613 -0.89571,0.417452 -1.79328,0.829523 -2.697113,1.229112 -0.163245,0.07272 -0.325867,0.146699 -0.488386,0.22103 -0.479685,0.218036 -0.95538,0.424624 -1.455913,0.590486 -1.360704,0.446534 -1.360704,0.446534 -2.287406,1.481382 -0.245318,0.493826 -0.429824,1.013225 -0.609786,1.533697 -0.224605,0.644942 -0.513576,1.255113 -0.807762,1.870696 -0.150837,0.316711 -0.298311,0.634973 -0.445763,0.95327 -0.02894,0.06237 -0.05788,0.124745 -0.0877,0.189007 -0.287377,0.620886 -0.564826,1.246029 -0.840809,1.872042 -0.436151,0.989056 -0.884052,1.972263 -1.33888,2.952872 -0.0452,0.09754 -0.0452,0.09754 -0.09131,0.197057 -0.08597,0.185415 -0.172102,0.370757 -0.258312,0.556062 -0.02525,0.05437 -0.05049,0.108748 -0.0765,0.164768 -0.121751,0.261006 -0.245311,0.521078 -0.371952,0.779749 -0.02296,0.04695 -0.04591,0.09389 -0.06956,0.142265 -0.1889,0.341782 -0.526358,0.573329 -0.870152,0.741569 -0.510356,0.09374 -0.901291,0.06543 -1.381007,-0.137843 -0.523665,-0.364646 -0.733773,-0.877215 -0.948851,-1.458668 -0.04679,-0.122514 -0.04679,-0.122514 -0.09453,-0.247505 -0.0846,-0.222055 -0.16827,-0.444437 -0.251544,-0.666995 -0.08844,-0.235635 -0.178134,-0.470794 -0.26773,-0.705993 C 10.12636,28.343182 9.9793148,27.955033 9.8326432,27.566736 9.5470474,26.811029 9.256209,26.057349 8.9654351,25.303623 8.8142166,24.911402 8.6634631,24.519002 8.5126774,24.126615 8.4524748,23.969989 8.3922707,23.813364 8.3320636,23.656739 8.3022356,23.579143 8.2724076,23.501547 8.2416764,23.4216 7.9976115,22.78675 7.7534138,22.151951 7.5092388,21.517144 7.3563432,21.119638 7.2034574,20.72213 7.0505707,20.324621 6.9894348,20.165667 6.9282987,20.006714 6.8671626,19.84776 5.020185,15.045618 3.1732075,10.243477 1.3262299,5.4413349 1.2979018,5.3676899 1.2695736,5.294045 1.2403872,5.218169 1.1844079,5.072606 1.1284507,4.9270349 1.0725168,4.7814551 0.91931173,4.3828003 0.76558612,3.984354 0.61129623,3.586118 0.57761533,3.4990111 0.54393443,3.4119042 0.5092329,3.3221576 0.44408069,3.153679 0.37879371,2.9852524 0.31335423,2.8168851 0.26938479,2.7030611 0.26938479,2.7030611 0.22452708,2.5869375 0.18556689,2.4864479 0.18556689,2.4864479 0.14581964,2.3839281 -0.04165373,1.8627424 -0.05897016,1.3835442 0.15614306,0.86988602 0.36515039,0.48113243 0.76661019,0.18362817 1.1723389,0.02133666 1.7009156,-0.04084883 2.0901639,0.0351448 2.5822892,0.2199333 Z"
                  fill={cursor.color}
                  stroke="#000000"
                  stroke-width="1"
                />
              </svg>
            {/snippet}
          </Marker>
        {/each}
      </div>
    {/if}
  </div>
  <div class="menu-row">
    {#each modeNames as modeName (modeName)}
      <label>
        <input type="radio" bind:group={mode} value={modeName} disabled={isControlDisabled(modeName)} />
        {modeName}
      </label>
    {/each}
    <button
      disabled={selected === null}
      onclick={() => {
        if (!selected) return;
        draw?.removeFeatures([selected]);
        draw?.deselectFeature(selected);
      }}
    >
      Delete
    </button>
    <button
      disabled={!selectionIsModifiedFeature}
      onclick={() => {
        if (!selected) return;
        if (!selectionIsModifiedFeature) return;
        if (!draw) return;
        resetFeature(editorDoc, draw, selected);
      }}
    >
      Reset
    </button>
    <select name="new_features_layer" id="newFeaturesLayer" bind:value={layerForNewFeatures}>
      <option value="" disabled selected>Select layer for new feature</option>
      {#each layerTypes as layerType}
        <option value={layerType}>{layerType.id}</option>
      {/each}
    </select>
  </div>
</div>

<style>
  .menubar {
    display: flex;
    flex-direction: row;
    height: 32px;
    align-items: center;
    justify-content: space-between;
  }

  .controls {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: var(--map-top-offset);
    background: white;
    padding: 0 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    z-index: 1;
    border-bottom: 1px solid #ccc;
    box-sizing: border-box;
  }

  .menu-row {
    padding: 0.5rem 0;
  }

  .menu-row *:has(input[type='radio']:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .active-users {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex-direction: row;
  }
</style>
