import { untrack } from 'svelte';

interface AsyncRuneState<DataType, ErrorType> {
  value: DataType | undefined;
  error: ErrorType | undefined;
  /**
   * Indicates whether the async operation has resolved at least once.
   * If an initialValue is provided, this will be true from the start.
   */
  hasResolved: boolean;
  /**
   * Indicates whether the async operation is currently pending.
   */
  isPending: boolean;
  abortController: AbortController;
}

export function useAsync<DataType, ErrorType = unknown>(
  asyncFunction: (
    signal: AbortSignal,
    skip: (mode?: 'skip' | 'andClear') => void
  ) => Promise<DataType | void>,
  initialValue?: Exclude<DataType, void>
) {
  const _rune = $state<AsyncRuneState<DataType, ErrorType>>({
    value: initialValue,
    error: undefined,
    hasResolved: initialValue === undefined,
    isPending: false,
    abortController: new AbortController(),
  });

  $effect(() => {
    _rune.isPending = true;
    _rune.abortController = new AbortController();
    const signal = untrack(() => _rune.abortController.signal);

    let shouldSkip = false;
    let shouldClearValue = false;
    const skip = (mode: 'skip' | 'andClear' = 'skip') => {
      shouldSkip = true;
      if (mode === 'andClear') {
        shouldClearValue = true;
      }
    };

    asyncFunction(signal, skip)
      .then((data) => {
        if (shouldSkip) {
          if (shouldClearValue) _rune.value = undefined;
          return;
        }

        _rune.value = data ?? undefined;
        _rune.hasResolved = true;
      })
      .catch((error) => {
        if (shouldSkip) {
          return;
        }

        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        console.error('Error in $async rune:', error);
        _rune.error = error;
      })
      .finally(() => {
        _rune.isPending = false;
      });

    return () => {
      _rune.abortController?.abort();
    };
  });

  return _rune;
}
