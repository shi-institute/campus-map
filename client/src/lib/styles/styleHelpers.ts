/**
 * Maplibre line dash arrays are scaled in between integer zoom levels, which can make
 * dashes and their gaps appear larger than desired at non-integer zoom levels. This function
 * creates a line dash array expression that adjusts the dash and gap lengths based on the
 * current zoom level, making them appear more consistent across zoom levels.
 */
function createZoomResilientLineDashArray(
  dashLength: number,
  gapLength: number,
  { startZoom = 0, endZoom = 22, step = 0.1 } = {}
): maplibregl.DataDrivenPropertyValueSpecification<number[]> {
  const expr: any[] = ['step', ['zoom'], ['literal', [dashLength, gapLength]]];
  const steps = Math.floor((endZoom - startZoom) / step);

  for (let i = 0; i <= steps; i++) {
    const z = +(startZoom + i * step);
    const scale = (z % 1) + 1;
    const scaled = [+(dashLength / scale).toFixed(5), +(gapLength / scale).toFixed(5)];
    expr.push(z - 0.0000001, ['literal', scaled]);
  }

  return expr;
}

/**
 * Converts a ground size in meters to pixels at the current zoom level and latitude.
 */
function metersToPixelsExpression(
  meters: number,
  latitude: number,
  { startZoom = 0, endZoom = 22, step = 0.1 } = {}
): maplibregl.DataDrivenPropertyValueSpecification<number> {
  const WORLD_PIXELS_AT_ZOOM0 = 256;
  const EARTH_CIRCUMFERENCE_M = 40075016.686;
  const METERS_PER_PIXEL_AT_EQUATOR = EARTH_CIRCUMFERENCE_M / WORLD_PIXELS_AT_ZOOM0;

  const cosLat = Math.cos((latitude * Math.PI) / 180);

  const expr: maplibregl.DataDrivenPropertyValueSpecification<number> = ['interpolate', ['linear'], ['zoom']];

  const steps = Math.floor((endZoom - startZoom) / step);

  for (let i = 0; i <= steps; i++) {
    const z = +(startZoom + i * step);
    const lineWidth = (meters * Math.pow(2, z)) / (METERS_PER_PIXEL_AT_EQUATOR * cosLat);
    // zoom, line width (px)
    expr.push(z, +lineWidth.toFixed(5));
  }

  return expr;
}

/**
 * A utility function for customizing each layer in a MapLibre style. It takes a callback function that
 * is caled for each style. Return the unmodified or modified layer specification, or return null to
 * remove the layer.
 */
function customizeStyle(
  styleData: maplibregl.StyleSpecification | undefined,
  transformLayerOrOverridesSpec:
    | ((
        layer: maplibregl.LayerSpecification
      ) => maplibregl.LayerSpecification | maplibregl.LayerSpecification[] | null)
    | Record<string, Partial<maplibregl.LayerSpecification>[]>
) {
  if (!styleData) {
    return styleData;
  }

  // deep copy the style data
  const customizedStyle = JSON.parse(JSON.stringify(styleData)) as maplibregl.StyleSpecification;

  // if the second argument is an object, treat it as a map of layer ID to overrides
  // that need to be applied using this function
  if (typeof transformLayerOrOverridesSpec !== 'function') {
    const overridesSpec = transformLayerOrOverridesSpec;
    return customizeStyle(styleData, (_layer) => {
      const overrides = overridesSpec[_layer.id];
      if (overrides) {
        const layer = JSON.parse(JSON.stringify(_layer)) as typeof _layer;
        return overrides.map((override) => ({ ...layer, ...override }) as maplibregl.LayerSpecification);
      }
      return _layer;
    });
  }

  // transform each layer using the callback function
  const transformLayer = transformLayerOrOverridesSpec;
  customizedStyle.layers = customizedStyle.layers
    // require consumers to make a copy first
    .map((layer) => Object.freeze(layer))
    .flatMap(transformLayer)
    .filter((layer) => !!layer);

  return customizedStyle;
}

export const styleHelpers = { customizeStyle, createZoomResilientLineDashArray, metersToPixelsExpression };
