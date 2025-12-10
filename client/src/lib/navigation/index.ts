import { buildDirectionsRoute } from './directions';
import { interpretAppRoute } from './interpretAppRoute';
import { buildPlaceRoute } from './place';

export const routeBuilder = { buildDirectionsRoute, buildPlaceRoute };

export const routeInterpreter = { interpretAppRoute };

export type { FoundDirectionsRoute } from './directions';
export type { InterpretedRoute } from './interpretAppRoute';
export * from './router.js';
