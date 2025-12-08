<script lang="ts">
  import { convertRemToPixels } from '$lib/utils';
  import type { Snippet } from 'svelte';
  import { fade } from 'svelte/transition';
  import { IconButton } from '..';
  import { draggablePane } from './draggablePane.svelte';

  export interface LeftPaneProps {
    children?: Snippet;
    title: string;
    mapFrameHeight: number;
    mapFrameWidth: number;
    /** Whether the pane appears.*/
    open: boolean;
    /** Whether the pane is minimized when it is open. */
    minimized: boolean;
    /** Whether the pane is visible at all. When false, the pane will still exist, but it will be transparent and the inner content will not be rendered. Defaults to `true`. */
    visible?: boolean;
    /** Hides the close button from the pane titlebar. */
    hideCloseButton?: boolean;
    style?: string;
    onclose?: () => void;
  }

  let {
    children,
    title,
    mapFrameHeight,
    mapFrameWidth,
    minimized = $bindable(),
    open = $bindable(),
    visible = $bindable(true),
    hideCloseButton = false,
    style,
    onclose,
  }: LeftPaneProps = $props();
</script>

<aside
  style:--map-frame-height={mapFrameHeight + 'px'}
  style:--map-frame-width={mapFrameWidth + 'px'}
  {style}
  class:minimized
  class:invisible={!visible}
  class:closed={!open}
  {@attach draggablePane({
    shouldListen: visible,
    setMinimized: (value: boolean) => {
      minimized = value;
    },
    minHeight: convertRemToPixels(3),
    maxHeight: mapFrameHeight - convertRemToPixels(5),
  })}
>
  <div
    class="header-bar"
    ondblclick={() => (minimized = !minimized)}
    role="toolbar"
    aria-label="{title} pane controls"
    tabindex="0"
  >
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
    {#if !hideCloseButton}
      <IconButton
        size="14px"
        onclick={() => {
          open = false;
          onclose?.();
        }}
      >
        <svg viewBox="0 0 24 24">
          <path
            d="m4.21 4.387.083-.094a1 1 0 0 1 1.32-.083l.094.083L12 10.585l6.293-6.292a1 1 0 1 1 1.414 1.414L13.415 12l6.292 6.293a1 1 0 0 1 .083 1.32l-.083.094a1 1 0 0 1-1.32.083l-.094-.083L12 13.415l-6.293 6.292a1 1 0 0 1-1.414-1.414L10.585 12 4.293 5.707a1 1 0 0 1-.083-1.32l.083-.094-.083.094Z"
            fill="currentColor"
          />
        </svg>
      </IconButton>
    {/if}
  </div>

  <div class="content-area">
    {#key visible}
      <div class="content" in:fade={{ duration: 300 }} out:fade={{ duration: 300 }}>
        {#if !closed && visible}
          {@render children?.()}
        {/if}
      </div>
    {/key}
  </div>
</aside>

<style>
  aside {
    --header-bar-height: 3rem;
    --blank-space-height: 5rem;
    --aside-height: calc(var(--map-frame-height) - var(--blank-space-height));

    position: relative;
    height: var(--aside-height);
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
      width 300ms var(--easing-expo-out),
      opacity 300ms var(--easing-expo-out),
      transform 300ms var(--easing-expo-out);
  }
  aside :global(*) {
    /* ensure that the browser does not take over the pointer event while dragging to implement panning gestures */
    touch-action: none;
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
  aside.invisible {
    opacity: 0;
    pointer-events: none;
    user-select: none;
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
      width: 100%;
      transform: translate(-1rem, 1rem);
      height: calc(var(--aside-height) + 1rem);
    }
    aside.minimized {
      width: calc(100% - 2rem);
      transform: translate(0);
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

  .content-area {
    flex-grow: 1;
    flex-shrink: 1;
    padding: 0.5rem 1rem;
    overflow: auto;
    position: relative;
  }
</style>
