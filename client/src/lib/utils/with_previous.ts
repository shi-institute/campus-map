/**
 * A higher order function to be used with the svelte `$derived` rune when
 * you need to know the previous value of the derived store before computing
 * the next value.
 * 
 * @see https://github.com/sveltejs/svelte/pull/13250#issuecomment-2360769943
 * 
 * @example
 * ```svelte
  
  <script>
    import { with_previous } from '$lib/utils';

    let count = $state(0);

    const { current: doubled, previous: oldDoubled } = $derived.by(with_previous((prev) => {
      return {
        current: count * 2,
        previous: prev?.current
      };
    }, null));
    
    function increment() {
      count += 1;
    }
  </script>

  <button onclick={increment}>
    clicks: {count}
  </button>
  <p>doubled: {doubled}</p>
  <p>previous: {oldDoubled ?? '...'}</p>
 * ```
 * @param cb A callback function that receives the previous value and returns the next value.
 * @param initial The initial value to use as the "previous" value on the first call.
 * @returns A function that, when called, returns the next value computed by the callback.
 */
export function with_previous<Next, Initial>(
  cb: (previous: Initial, initial: Initial) => Next,
  initial: Initial
): () => Next;

export function with_previous<Next>(cb: (previous: undefined) => Next): () => Next;

export function with_previous<Next, Initial>(
  cb: (previous: Initial | undefined, initial?: Initial) => Next,
  initial?: Initial
): () => Next {
  let prev = initial;
  let hasPrev = initial !== undefined;

  return () => {
    const next = cb((hasPrev ? prev : undefined) as Initial | undefined, initial);
    prev = next as unknown as Initial;
    hasPrev = true;
    return next;
  };
}
