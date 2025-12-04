<script lang="ts">
  import type { Snippet } from 'svelte';

  interface IconButtonProps {
    children?: Snippet;
    href?: string;
    disabled?: boolean;
    class?: string;
    onclick?: (event: MouseEvent) => void;
    size?: string;
  }

  let { children, href, class: className, disabled, onclick, size = '16px' }: IconButtonProps = $props();
</script>

<svelte:element
  this={href ? 'a' : 'button'}
  {href}
  class={'icon-button ' + (className ?? '')}
  {disabled}
  {onclick}
  role="button"
  tabindex="0"
  style:--icon-size={size}
>
  {#if children}
    {@render children()}
  {/if}
</svelte:element>

<style>
  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    position: relative;
    border: none;
    box-sizing: border-box;
    padding-block: 4px 6px;
    min-inline-size: 30px;
    min-block-size: 30px;
    padding: 8px;
    color: var(--wui-text-primary);
    border-radius: var(--wui-control-corner-radius);
    background-color: var(--wui-subtle-transparent);
    transition: background var(--wui-control-faster-duration) ease;
    flex-grow: 0;
    flex-shrink: 0;
  }
  .icon-button:hover {
    background-color: var(--wui-subtle-secondary);
  }
  .icon-button:active {
    background-color: var(--wui-subtle-tertiary);
    color: var(--wui-text-secondary);
  }
  .icon-button:disabled {
    background-color: var(--wui-subtle-disabled);
    color: var(--wui-text-disabled);
  }

  .icon-button :global(svg) {
    inline-size: var(--icon-size, 16px);
    block-size: auto;
    fill: currentColor;
  }
</style>
