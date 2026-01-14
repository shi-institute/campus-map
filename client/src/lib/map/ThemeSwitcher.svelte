<script lang="ts">
  import { IconButton } from '$lib/components';
  import { goto, url } from '$lib/navigation';
  import { CustomControl } from 'svelte-maplibre-gl';

  interface ThemeSwitcherProps {
    /** The location of the control. Defaults to `'bottom-left'`.*/
    position?: maplibregl.ControlPosition;
    /** Ids for */
    terrainSourceIds?: string[];
  }

  let { position = 'bottom-left' }: ThemeSwitcherProps = $props();

  const currentTheme = $derived($url.searchParams.get('style'));
  let overlayOpen = $state(false);

  function setTheme(theme: string | null) {
    const params = new URLSearchParams($url.searchParams);
    if (theme) {
      params.set('style', theme);
    } else {
      params.delete('style');
    }
    const newUrl = new URL($url.href);
    newUrl.search = params.toString();
    goto(newUrl.href);
  }
</script>

<CustomControl {position} class="theme-switcher">
  <button class="thumbnail" onclick={() => (overlayOpen = !overlayOpen)}>
    <img src="" alt="Switch theme and customize layers" />
  </button>
  <!-- TODO: a different style on mobile that uses the full screen -->
  <aside class:open={overlayOpen}>
    <IconButton
      class="close-button"
      size="14px"
      onclick={() => {
        overlayOpen = false;
      }}
    >
      <svg viewBox="0 0 24 24">
        <path
          d="m4.21 4.387.083-.094a1 1 0 0 1 1.32-.083l.094.083L12 10.585l6.293-6.292a1 1 0 1 1 1.414 1.414L13.415 12l6.292 6.293a1 1 0 0 1 .083 1.32l-.083.094a1 1 0 0 1-1.32.083l-.094-.083L12 13.415l-6.293 6.292a1 1 0 0 1-1.414-1.414L10.585 12 4.293 5.707a1 1 0 0 1-.083-1.32l.083-.094-.083.094Z"
          fill="currentColor"
        />
      </svg>
    </IconButton>
    <section>
      <h1>Themes</h1>
      <div class="thumbnails">
        <button
          class="thumbnail"
          class:current={currentTheme === 'print'}
          disabled={currentTheme === 'print'}
          onclick={() => setTheme('print')}
        >
          <img src="" alt="Default" />
        </button>
        <button
          class="thumbnail"
          class:current={currentTheme === 'parking'}
          disabled={currentTheme === 'parking'}
          onclick={() => setTheme('parking')}
        >
          <img src="" alt="Parking" />
        </button>
        <button
          class="thumbnail"
          class:current={currentTheme === 'hiking'}
          disabled={currentTheme === 'hiking'}
          onclick={() => setTheme('hiking')}
        >
          <img src="" alt="Trails & Hiking" />
        </button>
        <button
          class="thumbnail"
          class:current={!currentTheme}
          disabled={!currentTheme}
          onclick={() => setTheme(null)}
        >
          <img src="" alt="Unstyled" />
        </button>
      </div>
    </section>
    <section>
      <h1>Layers</h1>
      <div class="thumbnails">
        <button class="thumbnail" disabled>
          <img src="" alt="Terrain" />
        </button>
      </div>
    </section>
  </aside>
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

  :global(.theme-switcher) button.thumbnail {
    font-family: 'Brandon Grotesque', sans-serif;
    width: 4.5rem;
    height: 4.5rem;
    border: 1px solid black;
    padding: 0;
  }

  :global(.theme-switcher) button.thumbnail > img {
    display: block;
    block-size: 100%;
    inline-size: 100%;
    background-color: aqua;
    line-height: 1;
  }

  aside {
    position: absolute;
    bottom: calc(100% + 0.5rem);
    background-color: #fafafa;
    box-shadow:
      var(--wui-flyout-shadow),
      0 0 0 1px var(--wui-surface-stroke-default);
    right: 0;
    padding: 0.75rem 1rem;
    opacity: 0;
    pointer-events: none;
    transition: 0.2s ease-in-out;
    animation: slideOut 0.2s forwards;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(20%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes slideOut {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(4%);
    }
  }

  aside.open {
    animation: slideIn 0.2s forwards;
    pointer-events: all;
  }

  aside section h1 {
    font-size: 1.25rem;
    font-weight: 500;
    margin: 0;
  }

  .thumbnails {
    display: flex;
    gap: 0.5rem;
    margin: 0.5rem 0 1rem;
  }

  button.thumbnail:disabled {
    color: currentColor;
    border: 1px solid red;
    cursor: not-allowed;
  }
  button.thumbnail.current {
    border: 4px solid blue;
  }
  button.thumbnail.current > img {
    background-color: blueviolet;
  }

  aside :global(.close-button) {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
  }
</style>
