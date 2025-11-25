import { Pool } from 'pg';
import { z } from 'zod';

/**
 * Connects to the PostgreSQL database and lists all tables with geometry columns.
 *
 * The connection string should specify the database and schema to inspect.
 */
export async function listDbGeometryTables(pool: Pool) {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT f_table_name, f_geometry_column, type
      FROM geometry_columns
      WHERE f_table_schema = 'data';
    `);

    const parsed = z.array(resultSchema).parse(res.rows);

    return parsed.map((row) => {
      return {
        name: row.f_table_name,
        schema: 'data',
        geometry: {
          type: row.type,
          column: row.f_geometry_column,
        },
      };
    });
  } finally {
    client.release();
  }
}

const geometryTypeSchema = z.enum([
  'POINT',
  'POINTZ',
  'POINTM',
  'POINTZM',
  'LINESTRING',
  'LINESTRINGZ',
  'LINESTRINGM',
  'LINESTRINGZM',
  'POLYGON',
  'POLYGONZ',
  'POLYGONM',
  'POLYGONZM',
  'MULTIPOINT',
  'MULTIPOINTZ',
  'MULTIPOINTM',
  'MULTIPOINTZM',
  'MULTILINESTRING',
  'MULTILINESTRINGZ',
  'MULTILINESTRINGM',
  'MULTILINESTRINGZM',
  'MULTIPOLYGON',
  'MULTIPOLYGONZ',
  'MULTIPOLYGONM',
  'MULTIPOLYGONZM',
  'GEOMETRYCOLLECTION',
]);

const resultSchema = z.object({
  f_table_name: z.string(),
  f_geometry_column: z.string(),
  type: geometryTypeSchema,
});
