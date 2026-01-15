import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initEvents } from '../startup/index.js';
import { exportDbGeometryTableToFlatGeobuf } from './exportDbGeometryTableToFlatGeobuf.js';
import { generateRoutingTables, RoutingInitOptions } from './generateRoutingTables.js';
import { generateVectorTiles } from './generateVectorTiles.js';
import { constants } from './index.js';
import { kartDatabasePool } from './kartDatabasePool.js';
import { listDbGeometryTables } from './listDbGeometryTables.js';

export async function generateServiceFiles(tileFolder: string, routingOptions?: RoutingInitOptions) {
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
  initEvents.emit('kartdata');

  writeFeatureServerStubs(tables.map((table) => ({ ...table, folder: 'data' }))).then(() => {
    console.log('Wrote FeatureServer stubs for kart tables.');
    initEvents.emit('servicesdirectoryupdated', 'kart');
  });

  // generate vector tiles that contain all exported tables
  generateVectorTiles(constants.databaseGeometryExportFolder, tileFolder).then(async () => {
    console.log('Generated vector tiles.');
    initEvents.emit('vectortilesdata');
    initEvents.emit('servicesdirectoryupdated', 'vectortiles');
  });

  // generate routing tables for pgRouting
  if (routingOptions) {
    console.log('Creating pgRouting database...');
    generateRoutingTables(constants.databaseGeometryExportFolder, routingOptions).then(async () => {
      console.log('Generated routing tables.');
      const routingTables = [
        { name: routingOptions?.edgesTableName || 'edges', schema: 'public', folder: 'routing' },
        { name: routingOptions?.verticesTableName || 'vertices', schema: 'public', folder: 'routing' },
      ];
      await writeFeatureServerStubs(routingTables);
      initEvents.emit('routingdata');
      initEvents.emit('servicesdirectoryupdated', 'routing');
    });
  }
}

/**
 * Generates empty FeatureServer.stub files for each table
 * in the provided list.
 *
 * The server uses the presence of these stub files to identify
 * which tables should be exposed as FeatureServer services.
 */
async function writeFeatureServerStubs(
  tables: {
    name: string;
    schema: string;
    folder: string;
  }[]
) {
  for await (const table of tables) {
    const serviceDir = path.join(
      constants.fileBasedServicesDataFolder,
      table.folder,
      `${table.schema}."${table.name}"`
    );
    await rm(serviceDir, { recursive: true, force: true });
    await mkdir(serviceDir, { recursive: true });
    const serviceStubPath = path.join(serviceDir, 'FeatureServer.stub');
    await writeFile(serviceStubPath, '', 'utf-8');
  }
}
