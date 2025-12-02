<script>
  import { BellTowerLogo } from '$lib/icons';
  import { CustomControl } from 'svelte-maplibre-gl';
</script>

<CustomControl position="top-left" class="logo-header">
  <BellTowerLogo width="32" height="32" />
  <hr />
  <h1>Campus Map</h1>
</CustomControl>

<style>
  :global(.maplibregl-ctrl-top-left .logo-header.maplibregl-ctrl) {
    margin: 1rem;
  }

  :global(.logo-header.maplibregl-ctrl-group) {
    background-color: transparent;
    border-radius: 0;
    box-shadow: none !important;
  }

  :global(.logo-header) {
    font-family: 'Brandon Grotesque', sans-serif;
    display: flex;
    align-items: center;
    gap: 1rem;
    user-select: none;
  }

  :global(.logo-header) hr {
    height: 1.5rem;
    border: none;
    border-left: 2px solid black;
    margin: 0;
  }

  :global(.logo-header) h1 {
    font-weight: 700;
    font-size: 1.5rem;
    margin: 0;
    text-shadow: 0 0 2px #ffffff;
  }
</style>
