<script lang="ts">
  import { convertRemToPixels } from '$lib/utils';
  import type { Snippet } from 'svelte';
  import { IconButton } from '..';
  import { draggablePane } from './draggablePane.svelte';

  interface LeftPaneProps {
    children?: Snippet;
    title: string;
    mapFrameHeight: number;
    mapFrameWidth: number;
    /** Whether the pane appears.*/
    open: boolean;
    /** Whether the pane is minimized when it is open. */
    minimized: boolean;
  }

  let {
    children,
    title,
    mapFrameHeight,
    mapFrameWidth,
    minimized = $bindable(),
    open = $bindable(),
  }: LeftPaneProps = $props();
</script>

<aside
  style:--map-frame-height={mapFrameHeight + 'px'}
  style:--map-frame-width={mapFrameWidth + 'px'}
  class:minimized
  class:closed={!open}
  {@attach draggablePane({
    setMinimized: (value: boolean) => (minimized = value),
    minHeight: convertRemToPixels(3),
    maxHeight: mapFrameHeight - convertRemToPixels(5),
  })}
>
  <div class="header-bar">
    <h1>{title}</h1>
    <IconButton onclick={() => (minimized = !minimized)}>
      {#if minimized}
        <svg viewBox="0 0 24 24">
          <path
            d="M4.293 15.707a1 1 0 0 0 1.414 0L12 9.414l6.293 6.293a1 1 0 0 0 1.414-1.414l-7-7a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 0 1.414Z"
            fill="currentColor"
          />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24">
          <path
            d="M4.293 8.293a1 1 0 0 1 1.414 0L12 14.586l6.293-6.293a1 1 0 1 1 1.414 1.414l-7 7a1 1 0 0 1-1.414 0l-7-7a1 1 0 0 1 0-1.414Z"
            fill="currentColor"
          />
        </svg>
      {/if}
    </IconButton>
    <IconButton size="14px" onclick={() => (open = false)}>
      <svg viewBox="0 0 24 24">
        <path
          d="m4.21 4.387.083-.094a1 1 0 0 1 1.32-.083l.094.083L12 10.585l6.293-6.292a1 1 0 1 1 1.414 1.414L13.415 12l6.292 6.293a1 1 0 0 1 .083 1.32l-.083.094a1 1 0 0 1-1.32.083l-.094-.083L12 13.415l-6.293 6.292a1 1 0 0 1-1.414-1.414L10.585 12 4.293 5.707a1 1 0 0 1-.083-1.32l.083-.094-.083.094Z"
          fill="currentColor"
        />
      </svg>
    </IconButton>
  </div>

  <div class="content">
    {@render children?.()}
  </div>
</aside>

<style>
  aside {
    --header-bar-height: 3rem;

    position: relative;
    height: calc(var(--map-frame-height) - 5rem);
    width: 300px;
    display: flex;
    flex-direction: column;
    background-color: #fafafa;
    touch-action: none;

    box-sizing: border-box;
    overflow: auto;
    box-shadow:
      var(--wui-flyout-shadow),
      0 0 0 1px var(--wui-surface-stroke-default);

    transition:
      height 300ms var(--easing-expo-out),
      opacity 300ms var(--easing-expo-out),
      transform 300ms var(--easing-expo-out);
  }
  aside.minimized {
    height: var(--header-bar-height);
    overflow: hidden;
  }
  aside.closed {
    transform: translateY(calc(100% + 2rem));
    height: 0;
    overflow: hidden;
    transition-duration: 900ms;
  }

  @media (width <= 940px) {
    aside {
      width: 240px;
    }
  }

  @media (width <= 640px) {
    aside {
      width: 200px;
    }
  }

  @media (width <= 540px) {
    aside {
      width: calc(100% + 1rem);
      transform: translateX(-1rem);
    }
    aside.minimized {
      width: calc(100% - 1rem);
      transform: translateX(0);
    }
  }

  .header-bar {
    flex-grow: 0;
    flex-shrink: 0;

    display: flex;
    align-items: center;
    flex-direction: row;
    user-select: none;

    height: var(--header-bar-height);
    padding: 0 0.5rem 0 1rem;

    border-bottom: 1px solid var(--wui-surface-stroke-default);
  }

  h1 {
    flex-grow: 1;
    flex-shrink: 1;
    margin: 0;
    font-size: 1.25rem;
    font-weight: 500;
  }

  .content {
    flex-grow: 1;
    flex-shrink: 1;
    padding: 0.5rem 1rem;
    overflow: auto;
  }
</style>
