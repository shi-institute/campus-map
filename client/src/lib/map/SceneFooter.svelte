<script lang="ts">
  import { AttributionControl, ScaleControl } from 'maplibre-gl';
  import { onDestroy } from 'svelte';
  import { CustomControl, getMapContext } from 'svelte-maplibre-gl';

  interface ScaleAndCreditsControlProps {
    /** The location of the control. Defaults to `'bottom-right'`.*/
    position?: maplibregl.ControlPosition;
    /**
     * Options for the ScaleControl. Use this to control the units and maximum width.
     */
    scaleControlOptions?: maplibregl.ScaleControlOptions;
    /**
     * Attributions to show in addition to any other attributions.
     */
    customAttribution?: string | string[];
  }

  let {
    position = 'bottom-right',
    scaleControlOptions,
    customAttribution,
  }: ScaleAndCreditsControlProps = $props();

  const mapCtx = getMapContext();
  if (!mapCtx.map) throw new Error('Map instance is not initialized.');

  let scaleSegmentLengthLabel: number = $state(0);
  let scaleSegmentUnit: string = $state('');
  let scaleSegmentSize: number = $state(0);

  let scaleControl: ScaleControl | null = null;
  $effect(() => {
    scaleControl && mapCtx.map?.removeControl(scaleControl);
    scaleControl = new ScaleControl($state.snapshot(scaleControlOptions));

    // use a modified version of onAdd that uses our custom container
    // instead of creating a new one (all else is unchanged)
    scaleControl.onAdd = function (map) {
      this._map = map;
      this._container = document.createElement('div');
      this._map.on('move', () => {
        try {
          this._onMove();
          const [_segmentScale, _segmentUnit] = this._container.innerText.split(' ');
          scaleSegmentLengthLabel = parseFloat(_segmentScale);
          scaleSegmentUnit = _segmentUnit;
          scaleSegmentSize = this._container.style.width
            ? parseFloat(this._container.style.width.replace('px', ''))
            : 0;
        } catch {}
      });
      this._onMove();
      return document.createElement('span'); // dummy element; not used
    };

    mapCtx.map?.addControl(scaleControl, position);
  });

  onDestroy(() => {
    if (scaleControl) {
      try {
        mapCtx.map?.removeControl(scaleControl);
      } catch {}
    }

    if (attributionControl) {
      try {
        mapCtx.map?.removeControl(attributionControl);
      } catch {}
    }
  });

  let attributionControl: AttributionControl | null = null;
  let attributions = $state<{ label: string; href: string }[]>([]);
  $effect(() => {
    attributionControl && mapCtx.map?.removeControl(attributionControl);
    attributionControl = new AttributionControl({ customAttribution, compact: false });

    attributionControl.onAdd = function (map) {
      this._map = map;
      this._compact = this.options.compact;
      this._container = document.createElement('details');
      this._innerContainer = document.createElement('div');

      this._updateAttributions();
      this._updateCompact();

      const updateData = (event: maplibregl.MapDataEvent) => {
        try {
          this._updateData(event);
          if (!this._innerContainer) {
            return;
          }

          attributions = Array.from(this._innerContainer.childNodes)
            .flatMap<string | HTMLAnchorElement>((node) => {
              if (node instanceof Text) {
                const parts = node.textContent?.split(' | ') || [];
                return parts.filter((part) => part.trim() !== '');
              }
              if (node instanceof HTMLAnchorElement) {
                return [node];
              }
              return [];
            })
            .map((attributionLink) => {
              if (typeof attributionLink === 'string') {
                return { label: attributionLink, href: '' };
              }
              return { label: attributionLink.innerText, href: attributionLink.getAttribute('href') || '' };
            });
        } catch {}
      };

      this._map.on('styledata', updateData);
      this._map.on('sourcedata', updateData);
      this._map.on('terrain', updateData);
      this._map.on('resize', this._updateCompact);
      this._map.on('drag', this._updateCompactMinimize);

      return document.createElement('div'); // dummy element; not used
    };

    mapCtx.map?.addControl(attributionControl, position);
  });

  // $inspect(attributions);
</script>

<CustomControl {position} group={false} class="scene-footer-container">
  <div class="scene-footer">
    <div class="text">
      <div class="attributions">
        {#if attributions.length}
          <span>© </span>
        {/if}
        {#each attributions as { label, href }, index}
          {#if !href}
            <span>{label.replace('©', '')}</span>
          {:else}
            <a {href} target="_blank" rel="noreferrer nofollow">{label.replace('©', '')}</a>
          {/if}
          {index < attributions.length - 1 ? ', ' : ''}
        {/each}
      </div>
      <div class="footer-links">
        <a href="https://furman.edu" target="_blank">Furman University</a>
        <a href="https://furman.edu/shi-institute" target="_blank">Shi Applied Research</a>
      </div>
    </div>
    <div class="scale-container">
      <span class="scale-label">{scaleSegmentLengthLabel} {scaleSegmentUnit}</span>
      <div class="scale-bar" style:--width={scaleSegmentSize + 'px'}></div>
    </div>
  </div>
</CustomControl>

<style>
  :global(.scene-footer-container) {
    margin: 0 !important;
  }
  .scene-footer {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: start;
    justify-content: center;
    font-size: 10px;
    line-height: 13px;
    font-family: 'Brandon Grotesque', sans-serif;
    padding: 0 2rem 0 2px;
    background-color: rgba(255, 255, 255, 0.8);
  }

  .scene-footer .text > div {
    display: inline;
    margin-right: 1rem;
  }

  .scale-container {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .scale-bar {
    border: 2px solid currentColor;
    border-top: none;
    width: var(--width, 100px);
    height: 6px;
    box-sizing: border-box;
  }

  .footer-links > *:not(:last-child) {
    margin-right: 0.5rem;
  }
  .footer-links a {
    color: currentColor;
    white-space: nowrap;
  }
  .footer-links a:not(:hover):not(:active):not(:focus) {
    opacity: 0.6;
    text-decoration: none;
  }

  .attributions a {
    color: currentColor;
  }
  .attributions a:not(:hover):not(:active):not(:focus) {
    text-decoration: none;
  }
</style>
