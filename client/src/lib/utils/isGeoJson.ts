import { z } from 'zod';

type AllowedGeometry =
  | GeoJSON.Point
  | GeoJSON.LineString
  | GeoJSON.Polygon
  | GeoJSON.MultiPoint
  | GeoJSON.MultiLineString
  | GeoJSON.MultiPolygon;
type AllowedFeature = GeoJSON.Feature<AllowedGeometry>;

const geoJsonPositionSchema = z.number().array().length(2) satisfies z.ZodType<GeoJSON.Position>;

const geoJsonLineStringSchema = z.looseObject({
  type: z.literal('Feature'),
  properties: z.object({}),
  geometry: z.object({ coordinates: geoJsonPositionSchema.array(), type: z.literal('LineString') }),
}) satisfies z.ZodType<GeoJSON.Feature<GeoJSON.LineString>>;

const geoJsonMultiLineStringSchema = z.looseObject({
  type: z.literal('Feature'),
  properties: z.object({}),
  geometry: z.object({
    coordinates: geoJsonPositionSchema.array().array(),
    type: z.literal('MultiLineString'),
  }),
}) satisfies z.ZodType<GeoJSON.Feature<GeoJSON.MultiLineString>>;

const geoJsonPointSchema = z.looseObject({
  type: z.literal('Feature'),
  properties: z.object({}),
  geometry: z.object({ coordinates: geoJsonPositionSchema, type: z.literal('Point') }),
}) satisfies z.ZodType<GeoJSON.Feature<GeoJSON.Point>>;

const geoJsonMultiPointSchema = z.looseObject({
  type: z.literal('Feature'),
  properties: z.object({}),
  geometry: z.object({ coordinates: geoJsonPositionSchema.array(), type: z.literal('MultiPoint') }),
}) satisfies z.ZodType<GeoJSON.Feature<GeoJSON.MultiPoint>>;

const geoJsonPolygonSchema = z.looseObject({
  type: z.literal('Feature'),
  properties: z.object({}),
  geometry: z.object({ coordinates: geoJsonPositionSchema.array().array(), type: z.literal('Polygon') }),
}) satisfies z.ZodType<GeoJSON.Feature<GeoJSON.Polygon>>;

const geoJsonMultiPolygonSchema = z.looseObject({
  type: z.literal('Feature'),
  properties: z.object({}),
  geometry: z.object({
    coordinates: geoJsonPositionSchema.array().array().array(),
    type: z.literal('MultiPolygon'),
  }),
}) satisfies z.ZodType<GeoJSON.Feature<GeoJSON.MultiPolygon>>;

const allowedGeometriesSchema = z.union([
  geoJsonPointSchema,
  geoJsonLineStringSchema,
  geoJsonPolygonSchema,
  geoJsonMultiPointSchema,
  geoJsonMultiLineStringSchema,
  geoJsonMultiPolygonSchema,
]) satisfies z.ZodType<AllowedFeature>;

const featureCollectionSchema = z.looseObject({
  type: z.literal('FeatureCollection'),
  features: z.array(allowedGeometriesSchema),
}) satisfies z.ZodType<GeoJSON.FeatureCollection<AllowedGeometry>>;

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

export function isGeoJsonMultiLineStringFeatureCollection(
  data: unknown
): data is GeoJSON.FeatureCollection<GeoJSON.MultiLineString> {
  const multiLineStringFeatureCollectionSchema = z.looseObject({
    type: z.literal('FeatureCollection'),
    features: z.array(geoJsonMultiLineStringSchema),
  }) satisfies z.ZodType<GeoJSON.FeatureCollection<GeoJSON.MultiLineString>>;

  const result = multiLineStringFeatureCollectionSchema.safeParse(data);
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

export function isGeoJsonMultiPointFeatureCollection(
  data: unknown
): data is GeoJSON.FeatureCollection<GeoJSON.MultiPoint> {
  const multiPointFeatureCollectionSchema = z.looseObject({
    type: z.literal('FeatureCollection'),
    features: z.array(geoJsonMultiPointSchema),
  }) satisfies z.ZodType<GeoJSON.FeatureCollection<GeoJSON.MultiPoint>>;

  const result = multiPointFeatureCollectionSchema.safeParse(data);
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

export function isGeoJsonMultiPolygonFeatureCollection(
  data: unknown
): data is GeoJSON.FeatureCollection<GeoJSON.MultiPolygon> {
  const multiPolygonFeatureCollectionSchema = z.looseObject({
    type: z.literal('FeatureCollection'),
    features: z.array(geoJsonMultiPolygonSchema),
  }) satisfies z.ZodType<GeoJSON.FeatureCollection<GeoJSON.MultiPolygon>>;

  const result = multiPolygonFeatureCollectionSchema.safeParse(data);
  return result.success;
}

export function isGeoJsonFeature(data: unknown): data is AllowedFeature {
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

export function isGeoJsonMultiPolygonFeature(data: unknown): data is GeoJSON.Feature<GeoJSON.MultiPolygon> {
  const result = geoJsonMultiPolygonSchema.safeParse(data);
  return result.success;
}

export function isGeoJsonMultiLineStringFeature(
  data: unknown
): data is GeoJSON.Feature<GeoJSON.MultiLineString> {
  const result = geoJsonMultiLineStringSchema.safeParse(data);
  return result.success;
}

export function isGeoJsonMultiPointFeature(data: unknown): data is GeoJSON.Feature<GeoJSON.MultiPoint> {
  const result = geoJsonMultiPointSchema.safeParse(data);
  return result.success;
}
