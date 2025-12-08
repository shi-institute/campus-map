import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { z } from 'zod';
import { exec } from './index.js';

/**
 * Exports a PostGIS geometry table to a FlatGeobuf file.
 *
 * @param pool - The PostgreSQL connection pool.
 * @param tableName - The name of the table to export.
 * @param schema - The schema of the table to export.
 * @param geometryColumn - The name of the geometry column in the table.
 */
export async function exportDbGeometryTableToFlatGeobuf(
  pool: Pool,
  tableName: string,
  schema: string,
  geometryColumn: string,
  generateIndex = false,
  exportDirectory = '/tmp/fgb-exports/'
) {
  const client = await pool.connect();
  try {
    // use ogr2ogr to export the table to FlatGeobuf
    const exportPath = path.join(exportDirectory, `${schema}.${tableName}.fgb`);
    await rm(exportPath, { force: true });
    await mkdir(exportDirectory, { recursive: true });
    await exec(
      `ogr2ogr -f FlatGeobuf '${exportPath}' 'PG:${
        pool.options.connectionString
      }' -sql "SELECT *, auto_pk::text FROM \\"${schema}\\".\\"${tableName}\\"" -nln '${tableName}' ${
        // cast auto_pk to text necause ogr2ogr drops big ints
        generateIndex ? '-lco SPATIAL_INDEX=YES' : ''
      } -progress --debug on`,
      true,
      true
    );

    console.log(`Exported table ${schema}.${tableName} to FlatGeobuf at ${exportPath}`);
  } finally {
    client.release();
  }
}

const columnTypeSchema = z.object({
  column_name: z.string(),
  data_type: z.string(),
});
