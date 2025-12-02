<script lang="ts">
  import type { Snippet } from 'svelte';

  interface LeftPaneProps {
    children?: Snippet;
    title: string;
  }

  let { children, title }: LeftPaneProps = $props();
</script>

<aside>
  <h1>{title}</h1>

  {@render children?.()}
</aside>

<style>
  aside {
    height: 100%;
    width: 300px;
    background-color: #f0f0f0;
    padding: 1rem;
    box-sizing: border-box;
    border-right: 1px solid #ccc;
  }
</style>
