interface FindFeatureOnMapParams {
  map: maplibregl.Map | null;
  sourceId?: string;
  layerId: string;
  featureId: number | string;
}

/**
 * Searches for a feature on the map given its source, layer, and feature ID.
 *
 * The function queries the specified source and layer for features,
 * returning the feature that matches the provided feature ID.
 *
 * The generic type T allows for extending the returned feature with additional properties.
 * The type T should be an object type (Record<string, unknown>). They will be merged
 * into the returned feature type as Partial<T>.
 */
export function findFeatureOnMap<T extends Record<string, unknown> = {}>({
  map,
  sourceId = 'esri',
  layerId,
  featureId,
}: FindFeatureOnMapParams): (maplibregl.GeoJSONFeature & Partial<T>) | null | undefined {
  if (!map) {
    return;
  }

  if (!map.isSourceLoaded(sourceId)) {
    throw new Error(`Map source is not loaded yet: ${sourceId}`);
  }

  const style = map.getStyle();
  if (!style) {
    throw new Error('Map style is not loaded yet');
  }

  const layers = style.layers.filter((layerSpec) => 'source' in layerSpec && layerSpec.source === sourceId);
  for (const layer of layers) {
    if (layer.id.toLowerCase() !== layerId.toLowerCase()) {
      continue;
    }

    const features = map.querySourceFeatures(sourceId, { sourceLayer: layer.id });
    for (const feature of features) {
      if (feature.id === featureId) {
        return feature as maplibregl.GeoJSONFeature & Partial<T>;
      }
    }
  }

  console.warn(`Feature not found on map: sourceId=${sourceId}, layerId=${layerId}, featureId=${featureId}`);
  return null;
}
