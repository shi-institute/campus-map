import { z } from 'zod';

type AllowedGeometry = GeoJSON.Feature<GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon>;

const geoJsonPositionSchema = z.number().array().length(2) satisfies z.ZodType<GeoJSON.Position>;

const geoJsonLineStringSchema = z.looseObject({
  type: z.literal('Feature'),
  properties: z.object({}),
  geometry: z.object({ coordinates: geoJsonPositionSchema.array(), type: z.literal('LineString') }),
}) satisfies z.ZodType<GeoJSON.Feature<GeoJSON.LineString>>;

const geoJsonPointSchema = z.looseObject({
  type: z.literal('Feature'),
  properties: z.object({}),
  geometry: z.object({ coordinates: geoJsonPositionSchema, type: z.literal('Point') }),
}) satisfies z.ZodType<GeoJSON.Feature<GeoJSON.Point>>;

const geoJsonPolygonSchema = z.looseObject({
  type: z.literal('Feature'),
  properties: z.object({}),
  geometry: z.object({ coordinates: geoJsonPositionSchema.array().array(), type: z.literal('Polygon') }),
}) satisfies z.ZodType<GeoJSON.Feature<GeoJSON.Polygon>>;

const allowedGeometriesSchema = z.union([
  geoJsonPointSchema,
  geoJsonLineStringSchema,
  geoJsonPolygonSchema,
]) satisfies z.ZodType<AllowedGeometry>;

const featureCollectionSchema = z.looseObject({
  type: z.literal('FeatureCollection'),
  features: z.array(allowedGeometriesSchema),
}) satisfies z.ZodType<GeoJSON.FeatureCollection<GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon>>;

export function isGeoJsonFeatureCollection(
  data: unknown
): data is GeoJSON.FeatureCollection<GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon> {
  const result = featureCollectionSchema.safeParse(data);
  return result.success;
}

export function isGeoJsonLineStringFeatureCollection(
  data: unknown
): data is GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const lineStringFeatureCollectionSchema = z.looseObject({
    type: z.literal('FeatureCollection'),
    features: z.array(geoJsonLineStringSchema),
  }) satisfies z.ZodType<GeoJSON.FeatureCollection<GeoJSON.LineString>>;

  const result = lineStringFeatureCollectionSchema.safeParse(data);
  return result.success;
}

export function isGeoJsonPointFeatureCollection(
  data: unknown
): data is GeoJSON.FeatureCollection<GeoJSON.Point> {
  const pointFeatureCollectionSchema = z.looseObject({
    type: z.literal('FeatureCollection'),
    features: z.array(geoJsonPointSchema),
  }) satisfies z.ZodType<GeoJSON.FeatureCollection<GeoJSON.Point>>;

  const result = pointFeatureCollectionSchema.safeParse(data);
  return result.success;
}

export function isGeoJsonPolygonFeatureCollection(
  data: unknown
): data is GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const polygonFeatureCollectionSchema = z.looseObject({
    type: z.literal('FeatureCollection'),
    features: z.array(geoJsonPolygonSchema),
  }) satisfies z.ZodType<GeoJSON.FeatureCollection<GeoJSON.Polygon>>;

  const result = polygonFeatureCollectionSchema.safeParse(data);
  return result.success;
}

export function isGeoJsonFeature(data: unknown): data is AllowedGeometry {
  const result = allowedGeometriesSchema.safeParse(data);
  return result.success;
}

export function isGeoJsonLineStringFeature(data: unknown): data is GeoJSON.Feature<GeoJSON.LineString> {
  const result = geoJsonLineStringSchema.safeParse(data);
  return result.success;
}

export function isGeoJsonPointFeature(data: unknown): data is GeoJSON.Feature<GeoJSON.Point> {
  const result = geoJsonPointSchema.safeParse(data);
  return result.success;
}

export function isGeoJsonPolygonFeature(data: unknown): data is GeoJSON.Feature<GeoJSON.Polygon> {
  const result = geoJsonPolygonSchema.safeParse(data);
  return result.success;
}
