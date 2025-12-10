import { SvelteURL } from 'svelte/reactivity';
import { get, readable, writable } from 'svelte/store';
import { interpretAppRoute } from './interpretAppRoute';

const url = writable(new SvelteURL(window.location.href));
const route = writable(interpretAppRoute(get(url)));

const backStack = writable<string[]>([]);
const forwardStack = writable<string[]>([]);

// watch for changes in the browser history
// and update the url and route stores accordingly
function handleHistoryChange(event: Event | CustomEvent | PopStateEvent) {
  const from = get(url);
  const to = new SvelteURL(window.location.href);
  to.hash = ''; // ignore hash changes for routing purposes

  // force trailing slash
  if (!to.pathname.endsWith('/')) {
    to.pathname += '/';
  }
  if (!from.pathname.endsWith('/')) {
    from.pathname += '/';
  }

  // confirm that the the only difference is not only the trailing slash
  if (to.href === from.href) {
    return;
  }

  // popstate event (indicates back/forward navigation)
  if (event instanceof PopStateEvent) {
    const backStackHrefs = get(backStack);
    const forwardStackHrefs = get(forwardStack);

    const isForwardNavigation = forwardStackHrefs.length > 0 && forwardStackHrefs[0] === to.href;
    const isBackNavigation =
      backStackHrefs.length > 0 && backStackHrefs[backStackHrefs.length - 1] === to.href;
    const isUnknownNavigation = !isForwardNavigation && !isBackNavigation;

    // for forward navigation, we need to transfer the closest href from the forward stack to the back stack
    if (isForwardNavigation) {
      forwardStack.update((currentStack) => currentStack.slice(1));
      backStack.update((currentStack) => [...currentStack, from.href]);
    }

    // for back navigation, we need to transfer the closest href from the back stack to the forward stack
    if (isBackNavigation) {
      backStack.update((currentStack) => currentStack.slice(0, -1));
      forwardStack.update((currentStack) => [from.href, ...currentStack]);
    }

    // for unknown navigation, we wipe the stack and add the current href to the back stack
    if (isUnknownNavigation) {
      forwardStack.set([]);
      backStack.set([from.href]);
    }
  }

  // other events mean new navigation
  else if (event instanceof CustomEvent && (event.type === 'pushstate' || event.type === 'replacestate')) {
    // for replaceState, we do not modify the stacks

    // for pushState, we add the current href to the back stack and clear the forward stack
    if (event.type === 'pushstate') {
      backStack.update((currentStack) => [...currentStack, from.href]);
      forwardStack.set([]);
    }
  }

  url.set(to);
  route.set(interpretAppRoute(to));
}
window.addEventListener('pushstate', handleHistoryChange);
window.addEventListener('replacestate', handleHistoryChange);
window.addEventListener('popstate', handleHistoryChange);

/**
 * Navigates to a new URL by updating the browser history.
 *
 * This function uses the History API to change the URL without reloading the page.
 * Make sure you are watching the `$url` and `$route` stores to react to URL changes,
 * not `window.location` directly.
 */
function goto(newUrl: string | URL, replace = false) {
  if (typeof newUrl === 'string') {
    newUrl = new URL(newUrl, window.location.href);
  }
  if (replace) {
    window.history.replaceState({}, '', newUrl.href);
    return;
  }
  window.history.pushState({}, '', newUrl.href);
}

/**
 * Navigates back in the app history if possible; otherwise goes to
 * the optional specified fallback URL.
 */
function goBack(fallback = '/') {
  if (get(backStack).length > 0) {
    window.history.back();
  } else if (fallback) {
    goto(fallback);
  }
}

/** Navigates forward in the app history if possible.
 */
function goForward() {
  if (get(forwardStack).length > 0) {
    window.history.forward();
  }
}

const readonlyUrl = { subscribe: url.subscribe };
const readonlyRoute = { subscribe: route.subscribe };
const readonlyHistoryStacks = readable(
  { backStack: get(backStack), forwardStack: get(forwardStack) },
  (set) => {
    const unsubscribeBack = backStack.subscribe((bs) => {
      set({ backStack: bs, forwardStack: get(forwardStack) });
    });
    const unsubscribeForward = forwardStack.subscribe((fs) => {
      set({ backStack: get(backStack), forwardStack: fs });
    });
    return () => {
      unsubscribeBack();
      unsubscribeForward();
    };
  }
);

export {
  goBack,
  goForward,
  goto,
  readonlyHistoryStacks as historyStack,
  readonlyRoute as route,
  readonlyUrl as url,
};
