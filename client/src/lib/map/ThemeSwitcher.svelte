<script lang="ts">
  import { CustomControl } from 'svelte-maplibre-gl';

  interface ThemeSwitcherProps {
    /** The location of the control. Defaults to `'bottom-left'`.*/
    position?: maplibregl.ControlPosition;
    /** Ids for */
    terrainSourceIds?: string[];
  }

  let { position = 'bottom-left' }: ThemeSwitcherProps = $props();
</script>

<CustomControl {position} class="theme-switcher">
  <button>
    <img src="" alt="Switch theme and customize layers" />
  </button>
</CustomControl>

<style>
  :global(.theme-switcher.maplibregl-ctrl) {
    margin: 1rem !important;
  }

  :global(.theme-switcher.maplibregl-ctrl-group) {
    background-color: transparent;
    border-radius: 0;
    box-shadow: none !important;
  }

  :global(.theme-switcher) button {
    font-family: 'Brandon Grotesque', sans-serif;
    width: 4.5rem;
    height: 4.5rem;
    border: 1px solid black;
    cursor:
      url('/cursors/zoom.png') 8 8,
      auto;
  }

  :global(.theme-switcher) img {
    display: block;
    block-size: 100%;
    inline-size: 100%;
    background-color: aqua;
    line-height: 1;
  }
</style>
