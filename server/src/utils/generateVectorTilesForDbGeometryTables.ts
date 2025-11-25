import { rm } from 'node:fs/promises';
import { exportDbGeometryTableToFlatGeobuf } from './exportDbGeometryTableToFlatGeobuf.js';
import { generateVectorTiles } from './generateVectorTiles.js';
import { constants } from './index.js';
import { kartDatabasePool } from './kartDatabasePool.js';
import { listDbGeometryTables } from './listDbGeometryTables.js';

interface RoutingOptions {
  databaseName: string;
  edgesTableName: string;
  verticesTableName: string;
  barriersTableName: string;
  edgesSourceLayers: string[];
  barriersSourceLayers: string[];
}

export async function generateVectorTilesForDbGeometryTables(
  tileFolder: string,
  routingOptions?: RoutingOptions
) {
  await rm(constants.tileGeometryExportFolder, { recursive: true, force: true });

  // export all geometry tables to flatgeobuf
  const tables = await listDbGeometryTables(kartDatabasePool);
  for await (const table of tables) {
    await exportDbGeometryTableToFlatGeobuf(
      kartDatabasePool,
      table.name,
      table.schema,
      table.geometry.column,
      false,
      constants.tileGeometryExportFolder
    );
  }

  // generate vector tiles that contain all exported tables
  await generateVectorTiles(constants.tileGeometryExportFolder, tileFolder).then(() => {
    console.log('Generated vector tiles.');
  });

  // generate
  if (routingOptions) {
    console.log('Creating pgRouting database...');

    // create a new database for routing
  }
}
