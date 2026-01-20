import { styleHelpers } from './styleHelpers';

/**
 * Overrides for map layer styles to be used in print maps.
 *
 * To get a complete style, use `rootStyleToPrintStyle()`.
 */
export const printMapLayerStyleOverrides: Record<string, Partial<maplibregl.LayerSpecification>[]> = {
  trails_provisional: [
    {
      paint: {
        'line-color': '#000',
        // 'line-width': metersToPixelsExpression(3.5),
        'line-width': 2.5,
        // 'line-dasharray': [0.5, 3],
        'line-dasharray': styleHelpers.createZoomResilientLineDashArray(0.5, 3),
      },
      layout: { 'line-cap': 'round', 'line-join': 'bevel' },
    },
  ],
  '4wd_road_provisional': (() => {
    const linePaint: maplibregl.LayerSpecification['paint'] = {
      'line-color': '#895a44',
      'line-width': 1.75,
      'line-dasharray': styleHelpers.createZoomResilientLineDashArray(5, 2),
    };

    const lineLayout: maplibregl.LayerSpecification['layout'] = { 'line-cap': 'butt', 'line-join': 'bevel' };

    return [
      { paint: { ...linePaint, 'line-offset': 2 }, layout: lineLayout },
      { id: '4wd_road_provisional‾‾right', paint: { ...linePaint, 'line-offset': -2 }, layout: lineLayout },
    ] satisfies Partial<maplibregl.LayerSpecification>[];
  })(),
  abandoned_road_provisional: (() => {
    const linePaint: maplibregl.LayerSpecification['paint'] = {
      'line-color': '#992E1E',
      'line-width': 1.75,
      'line-opacity': 0.5,
      'line-dasharray': styleHelpers.createZoomResilientLineDashArray(5, 6),
    };

    const lineLayout: maplibregl.LayerSpecification['layout'] = { 'line-cap': 'butt', 'line-join': 'bevel' };

    return [
      { paint: { ...linePaint, 'line-offset': 2 }, layout: lineLayout },
      {
        id: 'abandoned_road_provisional‾‾right',
        paint: { ...linePaint, 'line-offset': -2 },
        layout: lineLayout,
      },
    ] satisfies Partial<maplibregl.LayerSpecification>[];
  })(),
  perennial_lake_provisional: [{ paint: { 'line-color': '#57778b' } }],
  perennial_stream_provisional: [{ paint: { 'line-color': '#57778b' } }],
  sidewalks_provisional: [{ paint: { 'line-color': '#76787b', 'line-width': 2 } }],
};

/**
 * Applies overrides from `printMapLayerStyleOverrides` to the given root style to produce
 * a new map style that can be applied to the map.
 */
export function rootStyleToPrintStyle(rootStyle?: maplibregl.StyleSpecification) {
  return styleHelpers.customizeStyle(rootStyle, printMapLayerStyleOverrides);
}
