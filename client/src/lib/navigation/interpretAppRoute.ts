import type { SvelteURL } from 'svelte/reactivity';
import { interpretDirectionsRoute, type FoundDirectionsRoute } from './directions';
import { interpretPlaceRoute, type FoundPlaceRoute } from './place';

export interface UnfoundRoute {
  type: null;
}

export type InterpretedRoute = FoundDirectionsRoute | FoundPlaceRoute | UnfoundRoute;

export function interpretAppRoute(url: SvelteURL): InterpretedRoute {
  const directionsRoute = interpretDirectionsRoute(url);
  if (directionsRoute) {
    return directionsRoute;
  }

  const placeRoute = interpretPlaceRoute(url);
  if (placeRoute) {
    return placeRoute;
  }

  return { type: null };
}
