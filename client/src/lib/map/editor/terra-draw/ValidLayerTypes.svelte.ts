import { getFeatureServiceDetails } from '$lib/utils/features';
import type { getMapContext } from 'svelte-maplibre-gl';
import type { GeoJSONStoreFeatures } from 'terra-draw';

/**
 * Returns a reactive array of valid layer types present on the map's Esri source.
 *
 * The returned value is actually a proxy, so if you need to log it, use the spread operator:
 * ```ts
 * console.log([...layerTypes]);
 * ```
 *
 * Otherwise, direct array access (length, map, Symbol.iterator) will work as expected.
 */
export function getValidLayerTypes(mapCtx: ReturnType<typeof getMapContext>) {
  const t = new ValidLayerTypes(mapCtx);

  return new Proxy([], {
    get(_, prop) {
      // redirect all array access (length, map, Symbol.iterator) to the state
      const target = t.layerTypes;
      const value = Reflect.get(target, prop);
      return value;
    },
  }) as typeof t.layerTypes;
}

class ValidLayerTypes {
  layerTypes = $state<{ id: string; type: GeoJSONStoreFeatures['geometry']['type'] }[]>([]);

  constructor(mapCtx: ReturnType<typeof getMapContext>) {
    $effect(() => {
      if (!mapCtx.map) {
        return;
      }

      mapCtx.waitForSourceLoaded('esri', (map) => {
        this.updateLayerTypes(map);
      });

      const handleSourceData = (event: any) => {
        if (event.sourceId !== 'esri' || !event.isSourceLoaded || !mapCtx.map) {
          return;
        }
        this.updateLayerTypes(mapCtx.map);
      };

      mapCtx.map.on('sourcedata', handleSourceData);

      return () => {
        if (!mapCtx.map) {
          return;
        }
        mapCtx.map.off('sourcedata', handleSourceData);
      };
    });
  }

  private async updateLayerTypes(map: maplibregl.Map) {
    const style = map.getStyle();
    const layers = style.layers || [];
    const sourceLayers = layers.filter((layer) => layer.type !== 'background' && layer.source === 'esri');

    const uniqueLayerNames = new Set<string>();
    for (const layer of sourceLayers) {
      // exclude terradraw layers
      if (layer.id.startsWith('td-')) {
        continue;
      }

      // some styles generate extra layers for parallel lines,
      // but the base layer name always comes before '‾‾'
      uniqueLayerNames.add(layer.id.split('‾‾')[0]);
    }

    const newLayerTypes: typeof this.layerTypes = [];
    for await (const layerName of uniqueLayerNames) {
      const serviceDetails = await getFeatureServiceDetails(`data/data."${layerName}"`);
      if (!serviceDetails) {
        continue;
      }

      let type: GeoJSONStoreFeatures['geometry']['type'] | 'Unknown' = 'Unknown';
      switch (serviceDetails.geometryType) {
        case 'esriGeometryPoint':
          type = 'Point';
          break;
        case 'esriGeometryPolyline':
          type = 'LineString';
          break;
        case 'esriGeometryPolygon':
          type = 'Polygon';
          break;
        default:
          console.warn('Unknown geometry type for layer:', layerName, serviceDetails.geometryType);
      }

      if (type !== 'Unknown') {
        newLayerTypes.push({ id: layerName, type });
      }
    }

    // if the content of layerTypes is unchanged, do not update the state
    const oldLayerTypes = this.layerTypes.slice().sort((a, b) => a.id.localeCompare(b.id));
    const sortedNewLayerTypes = newLayerTypes.slice().sort((a, b) => a.id.localeCompare(b.id));
    const unchanged =
      oldLayerTypes.length === sortedNewLayerTypes.length &&
      oldLayerTypes.every(
        (value, index) =>
          value.id === sortedNewLayerTypes[index].id && value.type === sortedNewLayerTypes[index].type
      );
    if (unchanged) {
      return;
    }

    this.layerTypes = newLayerTypes;
  }
}
