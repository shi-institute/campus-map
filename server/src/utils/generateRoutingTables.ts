import { glob, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exec } from './exec.js';
import { getFirstLayerName } from './getFirstLayerName.js';
import { constants, convertWaysToEdges, getFirstLayerFeatureCount } from './index.js';

export interface RoutingInitOptions {
  edgesTableName?: string;
  verticesTableName?: string;
  waysLayers: string[];
}

export async function generateRoutingTables(inputFolder: string, options: RoutingInitOptions) {
  // list all .fgb files in the input folder
  const fgbFiles = await Array.fromAsync(glob(`${inputFolder}/*.fgb`));

  // create a working directory for intermediate files
  const workingDir = path.join(inputFolder, 'routing-working-dir');
  await rm(workingDir, { recursive: true, force: true });
  await mkdir(workingDir, { recursive: true });

  // filter the fgb files to only those needed for routing
  const waysFgbFiles = fgbFiles.filter((file) => options.waysLayers.includes(path.basename(file, '.fgb')));

  if (waysFgbFiles.length === 0) {
    throw new Error('No ways layers found for routing table generation.');
  }

  const mergedWaysFgbPath = path.join(workingDir, 'ways.fgb');
  mkdir(path.dirname(mergedWaysFgbPath), { recursive: true });
  rm(mergedWaysFgbPath, { force: true }); // ensure we start with no existing data

  // create a merged ways sources fgb file using the first ways source layer
  // and add a sequential way_id column (ROW_NUMBER() OVER () AS way_id)
  await exec(
    `ogr2ogr -f Flatgeobuf "${mergedWaysFgbPath}" "${waysFgbFiles[0]}" \
    -sql  "SELECT *, ROW_NUMBER() OVER () AS way_id FROM '${await getFirstLayerName(waysFgbFiles[0]!)}'" \
    -dialect SQLite \
    -nln ways`,
    false,
    true
  );

  // add additional ways layers to the merged ways fgb file
  for (const waysFgbFile of waysFgbFiles.slice(1)) {
    const layerName = await getFirstLayerName(waysFgbFile);

    // find how many features are already in the merged ways souces fgb file
    // so we can start incrementing way_id from there
    const edgeIdOffset = await getFirstLayerFeatureCount(mergedWaysFgbPath);

    // step 1: merge schema without adding rows (add missing columns)
    await exec(
      `ogr2ogr -f FlatGeobuf -update -append "${mergedWaysFgbPath}" "${waysFgbFile}" \
    -nln ways \
    -addfields \
    -sql "SELECT * FROM '${layerName}' LIMIT 0" \
    -dialect SQLite`,
      true,
      true
    );

    // step 2: append rows
    await exec(
      `ogr2ogr -f FlatGeobuf -update -append "${mergedWaysFgbPath}" "${waysFgbFile}" \
    -sql "SELECT *, ROW_NUMBER() OVER () + ${edgeIdOffset} AS way_id FROM '${layerName}'" \
    -dialect SQLite \
    -nln ways`,
      false,
      true
    );
  }

  // convert the ways to edges
  console.log('Converting ways to edges...');
  const edgesOutputPath = path.join(workingDir, 'edges.gpkg');
  await convertWaysToEdges(mergedWaysFgbPath, edgesOutputPath, undefined, undefined, true);
  await convertWaysToEdges(
    mergedWaysFgbPath,
    edgesOutputPath.replace('.gpkg', '.geojson'),
    undefined,
    undefined,
    true
  );

  // create a SQL dump file of the merged edges sources
  console.log('Generating routing tables SQL dump...');
  const dumpFilePath = path.join(workingDir, 'routing-tables.sql');
  await exec(
    `ogr2ogr -f "PGDUMP" "${dumpFilePath}" \
      "${edgesOutputPath}" \
      -nln ${options.edgesTableName ?? 'edges'} \
      -lco FID=fid \
      -dialect SQLite \
      -overwrite
      `,
    false,
    true
  );

  // prepend instructions to drop the tables if they exist
  let dumpFileContent = await readFile(dumpFilePath, 'utf-8');
  dumpFileContent =
    `
  -- drop the existing edges and vertices tables if they exist
  DROP TABLE IF EXISTS edges;
  DROP TABLE IF EXISTS vertices;

  -- load the edges table
  ` + dumpFileContent;

  // append additional instructions related to creating the routing topology
  dumpFileContent += `
  -- replace fid with edge_id and make edge_id the primary key
  UPDATE edges SET fid = edge_id;
  ALTER TABLE edges DROP COLUMN edge_id;
  ALTER TABLE edges RENAME COLUMN fid TO edge_id;

  -- make edge_id use BIGINT type
  ALTER TABLE edges
  ALTER COLUMN edge_id TYPE BIGINT;

  -- create the vertices table
  CREATE TABLE vertices AS
  SELECT *
  FROM pgr_extractVertices('SELECT edge_id AS id, geom FROM edges');

  -- set the SRID on the vertices table to match the edges table
  DO $$
  DECLARE
    -- prepare a variable to hold the SRID
    srid INTEGER;
  BEGIN
    -- get the SRID from the edges table
    SELECT Find_SRID('', 'edges', 'geom') INTO srid;

    -- apply the SRID to the vertices table
    EXECUTE format(
      'ALTER TABLE vertices
       ALTER COLUMN geom
       TYPE geometry(Point, %s)
       USING ST_SetSRID(geom, %s);',
      srid, srid
    );
  END
  $$;

  -- add start and end columns to the edges table
  ALTER TABLE edges
  ADD COLUMN start_vertex BIGINT,
  ADD COLUMN end_vertex BIGINT;

  -- populate the start column for each edge based on the corresponding start point in the vertices table
  UPDATE edges
  SET start_vertex = vertices.id
      FROM vertices
      WHERE ST_Equals(ST_StartPoint(edges.geom), vertices.geom);

  -- populate the end column for each edge based on the corresponding end point in the vertices table
  UPDATE edges
  SET end_vertex = vertices.id
      FROM vertices
      WHERE ST_Equals(ST_EndPoint(edges.geom), vertices.geom);

  -- add cost and reverse_cost columns to the edges table
  -- (costs help the routing algorithm determine the "cost" of traversing each edge)
  ALTER TABLE edges
  ADD COLUMN cost__distance DOUBLE PRECISION,
  ADD COLUMN reverse_cost__distance DOUBLE PRECISION;

  -- assign costs to each edge (for now, make the cost double the length of the edge)
  -- In the future, we may set more advanced costs based on speed limits, road types,
  -- one-way directions, etc.
  UPDATE edges
  SET cost__distance = ST_Length(geom) * 2,
      reverse_cost__distance = ST_Length(geom) * 2;
  `;

  // write the final dump file
  await writeFile(dumpFilePath, dumpFileContent, 'utf-8');

  // import the SQL dump file into the main database
  console.log('Importing routing tables into the database...');
  await exec(
    `PGHOST=${constants.database.host} \
      PGPORT=${constants.database.port} \
      PGUSER=${constants.database.username} \
      PGPASSWORD=${constants.database.password} \
      psql -d ${constants.database.routingdatabase} -f "${dumpFilePath}"`,
    false,
    true
  );

  // write service json file indicating the presence of the service
  const serviceDir = path.join(constants.fileBasedServicesDataFolder, 'FurmanCampusGraph');
  await rm(serviceDir, { recursive: true, force: true });
  await mkdir(serviceDir, { recursive: true });
  const serviceJsonPath = path.join(serviceDir, 'FU.RoutingServer.json');
  const serviceJsonContent = {
    name: 'Furman University Campus Routes',
    currentVersion: 11.5,
    description: 'Provides routing services across the campus map using pgRouting.',
    type: 'FU.RoutingServer',
    capabiltiies: ['SimpleSolve'],
  };
  await writeFile(serviceJsonPath, JSON.stringify(serviceJsonContent, null, 2), 'utf-8');

  console.log('Routing tables generated successfully.');
}
