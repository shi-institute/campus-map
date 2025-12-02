import { rm } from 'node:fs/promises';
import { exportDbGeometryTableToFlatGeobuf } from './exportDbGeometryTableToFlatGeobuf.js';
import { generateRoutingTables, RoutingInitOptions } from './generateRoutingTables.js';
import { generateVectorTiles } from './generateVectorTiles.js';
import { constants } from './index.js';
import { kartDatabasePool } from './kartDatabasePool.js';
import { listDbGeometryTables } from './listDbGeometryTables.js';

export async function generateVectorTilesForDbGeometryTables(
  tileFolder: string,
  routingOptions?: RoutingInitOptions
) {
  await rm(constants.databaseGeometryExportFolder, { recursive: true, force: true });

  // export all geometry tables to flatgeobuf
  const tables = await listDbGeometryTables(kartDatabasePool);
  for await (const table of tables) {
    await exportDbGeometryTableToFlatGeobuf(
      kartDatabasePool,
      table.name,
      table.schema,
      table.geometry.column,
      false,
      constants.databaseGeometryExportFolder
    );
  }

  // generate vector tiles that contain all exported tables
  await generateVectorTiles(constants.databaseGeometryExportFolder, tileFolder).then(() => {
    console.log('Generated vector tiles.');
  });

  // generate
  if (routingOptions) {
    console.log('Creating pgRouting database...');
    await generateRoutingTables(constants.databaseGeometryExportFolder, routingOptions);
  }
}
