import type { GeoJSONStoreFeatures } from 'terra-draw';

/**
 * Removes unnecessary properties from a Terra Draw feature
 * and reduces coordinate precision to no more than 9 decimal places.
 */
export function normalizeFeature<T extends GeoJSON.Feature<AllowedGeometries, AllowedProperties> | undefined>(
  feature: T
): T {
  if (!feature) {
    return feature;
  }

  // reduce coordinate precision to no more than 9 decimal places
  feature.geometry.coordinates = reducePrecision(feature.geometry.coordinates);

  // remove terra draw properties
  delete feature.properties.midPoint;
  delete feature.properties.selectionPoint;
  delete feature.properties.selected;
  delete feature.properties.mode;

  // order properties alphabetically
  if (feature.properties) {
    const orderedProperties: Record<string, any> = {};
    Object.keys(feature.properties)
      .sort()
      .forEach((key) => {
        orderedProperties[key] = feature.properties ? feature.properties[key] : undefined;
      });
    feature.properties = orderedProperties as AllowedProperties;
  }

  // order feature keys alphabetically
  const orderedFeature: Record<string, any> = {};
  Object.keys(feature)
    .sort()
    .forEach((key) => {
      orderedFeature[key] = (feature as any)[key];
    });
  return orderedFeature as T;
}

type AllowedGeometries = GeoJSONStoreFeatures['geometry'];
type AllowedProperties = GeoJSONStoreFeatures['properties'];

function reducePrecision(
  coords: GeoJSON.Position | GeoJSON.Position[] | GeoJSON.Position[][]
): GeoJSON.Position | GeoJSON.Position[] | GeoJSON.Position[][] {
  if (typeof coords[0] === 'number') {
    return (coords as GeoJSON.Position).map((coord) => parseFloat(coord.toFixed(9)));
  } else {
    return (coords as any).map((c: any) => reducePrecision(c));
  }
}
