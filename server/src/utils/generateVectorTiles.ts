import { glob, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { exec, uncapitalize } from './index.js';

/**
 * Identifies the FlatGeobuf files in the input folder and generates
 * vector tiles from them using tippecanoe.
 */
export async function generateVectorTiles(inputFolder: string, outputFolder: string) {
  // list all .fgb files in the input folder
  const fgbFiles = await Array.fromAsync(glob(`${inputFolder}/*.fgb`));

  // create a working directory for intermediate files
  const workingDir = path.join(inputFolder, 'tippecanoe-working-dir');
  await rm(workingDir, { recursive: true, force: true });
  await mkdir(workingDir, { recursive: true });

  // convert all FlatGeobuf files to web mercator (EPSG:3857) geojson lines using ogr2ogr
  // and store them in the working directory
  for await (const fgbFile of fgbFiles) {
    console.log(`Reprojecting ${fgbFile} to web mercator...`);
    const wgs84FgbFile = path.join(workingDir, `${path.parse(fgbFile).name}.geojsonl`);
    console.log(`  Output file: ${wgs84FgbFile}`);
    const ogr2ogrCmd = `ogr2ogr -f GeoJSONSeq -t_srs EPSG:3857 "${wgs84FgbFile}" "${fgbFile}"`;
    await exec(ogr2ogrCmd, true, true);
  }

  // list the files in the working directory
  // and prepare them as input options for tippecanoe
  const inputOptions = (await Array.fromAsync(glob(`${workingDir}/*.geojsonl`)))
    .map((filePath) => {
      const fileNameWithoutExt = path.parse(filePath).name;
      const layerNameParts = fileNameWithoutExt.split('.');
      const layerName = layerNameParts.slice(-1)[0];

      return {
        file: filePath,
        layer: uncapitalize(layerName || fileNameWithoutExt),
        description: '',
      };
    })
    .flatMap((option) => {
      return [`--named-layer='${JSON.stringify(option)}'`];
    });

  // construct the tippecanoe command
  const tileGenOutputDir = path.join(outputFolder, 'tile');
  await rm(tileGenOutputDir, { recursive: true, force: true });
  await mkdir(tileGenOutputDir, { recursive: true });
  const tippecanoeCmd = [
    'tippecanoe',
    '--output-to-directory',
    tileGenOutputDir,
    '-zg', // let tippecanoe choose the maximum zoom level
    '--drop-densest-as-needed',
    '--extend-zooms-if-still-dropping',
    '--force', // overwrite existing files
    '--read-parallel', // read input files in parallel
    '--use-attribute-for-id',
    'fid', // use the "fid" attribute as the unique feature id
    ...inputOptions,
  ].join(' ');

  // create the vector tiles
  await exec(tippecanoeCmd, true, true);

  // clean up the working directory
  // await rm(workingDir, { recursive: true });

  // read the metadata json
  const metadataJsonPath = path.join(tileGenOutputDir, 'metadata.json');
  const metadata = await readFile(metadataJsonPath, 'utf-8')
    .then((data) => JSON.parse(data))
    .then((json) => metadataSchema.parse(json));

  // create style.json for the vector tiles
  const style = createVectorTileStyle(
    metadata.vectorLayers,
    metadata.bounds,
    metadata.minZoom,
    metadata.maxZoom
  );
  const styleJsonPath = path.join(outputFolder, 'resources', 'styles', 'root.json'); // ArcGIS requires at least once style named "root"
  await mkdir(path.dirname(styleJsonPath), { recursive: true });
  await writeFile(styleJsonPath, JSON.stringify(style, null, 2), 'utf-8');

  // convert the bounds to web mercator for the VectorTileServer.json
  // (tippecanoe gives longitude and latitude in metadata.bounds)
  const { x: xmin, y: ymin } = await lonLatToWebMercator(metadata.bounds[0], metadata.bounds[1]);
  const { x: xmax, y: ymax } = await lonLatToWebMercator(metadata.bounds[2], metadata.bounds[3]);

  // create index.json for Esri Vector Tile Server
  const vectorTileServerJson = createEsriVectorTileServerIndex(
    'Furman University Campus Map',
    metadata.minZoom,
    metadata.maxZoom,
    {
      xmin,
      ymin,
      xmax,
      ymax,
    }
  );
  const vectorTileServerJsonPath = path.join(outputFolder, 'VectorTileServer.json');
  await writeFile(vectorTileServerJsonPath, JSON.stringify(vectorTileServerJson, null, 2), 'utf-8');
}

async function lonLatToWebMercator(lon: number, lat: number) {
  const result = await exec(
    `echo "${lon} ${lat}" | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:3857`,
    false,
    true
  );
  if (!result || result.trim() === 'transformation failed.') {
    throw new Error('Failed to convert coordinates with gdaltransform');
  }

  const [x, y, z] = result
    .trim()
    .split(' ')
    .map((v) => parseFloat(v));
  if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) {
    throw new Error('Invalid coordinates returned from gdaltransform');
  }

  return { x, y };
}

function createEsriVectorTileServerIndex(
  serverName: string,
  minZoom: number,
  maxZoom: number,
  extent: { xmin: number; ymin: number; xmax: number; ymax: number }
) {
  const data = {
    name: serverName,
    currentVersion: 11.5,
    capabilities: 'TilesOnly',
    type: 'indexedVector',
    defaultStyles: 'resources/styles', // relative path to styles folder, which must contain root.json
    tiles: ['tile/{z}/{x}/{y}.pbf'],
    exportTilesAllowed: false,
    initialExtent: {
      ...extent,
      spatialReference: {
        wkid: 102100,
        latestWkid: 3857,
      },
    },
    fullExtent: {
      ...extent,
      spatialReference: {
        wkid: 102100,
        latestWkid: 3857,
      },
    },
    minScale: 0,
    maxScale: 0,
    tileInfo: {
      rows: 512,
      cols: 512,
      dpi: 96,
      format: 'pbf',
      // top-left corner in web mercator
      origin: { x: -2.0037508342787e7, y: 2.0037508342787e7 },
      spatialReference: {
        wkid: 102100,
        latestWkid: 3857,
      },
      lods: [
        {
          level: 0,
          resolution: 78271.51696399994,
          scale: 295828763.795777,
        },
        {
          level: 1,
          resolution: 39135.75848200009,
          scale: 147914381.897889,
        },
        {
          level: 2,
          resolution: 19567.87924099992,
          scale: 73957190.948944,
        },
        {
          level: 3,
          resolution: 9783.93962049996,
          scale: 36978595.474472,
        },
        {
          level: 4,
          resolution: 4891.96981024998,
          scale: 18489297.737236,
        },
        {
          level: 5,
          resolution: 2445.98490512499,
          scale: 9244648.868618,
        },
        {
          level: 6,
          resolution: 1222.992452562495,
          scale: 4622324.434309,
        },
        {
          level: 7,
          resolution: 611.4962262813797,
          scale: 2311162.217155,
        },
        {
          level: 8,
          resolution: 305.74811314055756,
          scale: 1155581.108577,
        },
        {
          level: 9,
          resolution: 152.87405657041106,
          scale: 577790.554289,
        },
        {
          level: 10,
          resolution: 76.43702828507324,
          scale: 288895.277144,
        },
        {
          level: 11,
          resolution: 38.21851414253662,
          scale: 144447.638572,
        },
        {
          level: 12,
          resolution: 19.10925707126831,
          scale: 72223.819286,
        },
        {
          level: 13,
          resolution: 9.554628535634155,
          scale: 36111.909643,
        },
        {
          level: 14,
          resolution: 4.77731426794937,
          scale: 18055.954822,
        },
        {
          level: 15,
          resolution: 2.388657133974685,
          scale: 9027.977411,
        },
        {
          level: 16,
          resolution: 1.1943285668550503,
          scale: 4513.988705,
        },
        {
          level: 17,
          resolution: 0.5971642835598172,
          scale: 2256.994353,
        },
        {
          level: 18,
          resolution: 0.29858214164761665,
          scale: 1128.497176,
        },
        {
          level: 19,
          resolution: 0.149291070823808325,
          scale: 564.248588,
        },
        {
          level: 20,
          resolution: 0.0746455354119041625,
          scale: 282.124294,
        },
        {
          level: 21,
          resolution: 0.03732276770595208125,
          scale: 141.062147,
        },
        {
          level: 22,
          resolution: 0.018661383852976040625,
          scale: 70.5310735,
        },
      ],
    },
    minzoom: minZoom,
    maxzoom: maxZoom,
    resourceInfo: {
      styleVersion: 8,
      // the ArcGIS SDK for JavaScript ignores this setting, instead expecting the
      // browser to handle decompression based on the Content-Encoding header in the response
      tileCompression: 'gzip',
    },
  };

  // remove levels of detail outside of the min/max zoom range
  data.tileInfo.lods = data.tileInfo.lods.filter((lod) => {
    return lod.level >= minZoom && lod.level <= maxZoom;
  });

  return data;
}

function createVectorTileStyle(
  vectorLayersInfo: z.infer<typeof metadataVectorLayerSchema>[],
  bounds?: [number, number, number, number],
  minZoom?: number,
  maxZoom?: number
) {
  const sourceName = 'esri';

  let layers = [];
  for (const layerInfo of vectorLayersInfo) {
    layers.push({
      source: sourceName,
      'source-layer': layerInfo.id,
      minzoom: layerInfo.minZoom,
      // maxzoom: layerInfo.maxZoom, // showing this will cause the layer to disappear at higher zoom levels
      layout: {},
      id: layerInfo.id,
      type: 'line',
      paint: {
        'line-width': 1,
        'line-color': '#b13333ff',
      },
    });
  }

  return {
    version: 8,
    id: 'vector-tile-style',
    sources: {
      [sourceName]: {
        tiles: ['../../tile/{z}/{x}/{y}.pbf'],
        type: 'vector',
        url: '../../?f=json',
        scheme: 'xyz',
        bounds,
        tileSize: 512,
        minzoom: minZoom,
        maxzoom: maxZoom,
      },
    },
    layers: layers,
  };
}

const metadataTilestatsLayerSchema = z
  .object({
    layer: z.string(),
    geometry: z.string(),
    count: z.number(),
    attributeCount: z.number(),
    attributes: z.object({}).passthrough().array(),
  })
  .transform((val) => {
    return {
      id: val.layer,
      geometryType: val.geometry,
      featureCount: val.count,
      attributeCount: val.attributeCount,
      attributes: val.attributes,
    };
  });

const metadataVectorLayerSchema = z
  .object({
    id: z.string(),
    description: z.string().optional(),
    minzoom: z.number(),
    maxzoom: z.number(),
    fields: z.record(z.string()),
  })
  .transform((val) => {
    return {
      id: val.id,
      description: val.description,
      minZoom: val.minzoom,
      maxZoom: val.maxzoom,
      fieldTypes: val.fields,
    };
  });

const metadataJsonSchema = z
  .object({
    tilestats: z.object({
      layerCount: z.number(),
      layers: metadataTilestatsLayerSchema.array(),
    }),
    vector_layers: metadataVectorLayerSchema.array(),
  })
  .transform((val) => {
    return {
      tileStats: val.tilestats,
      vectorLayers: val.vector_layers,
    };
  });

const boundsTransform = z.string().transform((val) => {
  const parts = val.split(',').map((v) => parseFloat(v));
  if (parts.length !== 4) {
    throw new Error('Invalid bounds format in metadata');
  }
  return parts as [number, number, number, number];
});

const metadataSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    version: z.coerce.number(),
    minzoom: z.coerce.number(),
    maxzoom: z.coerce.number(),
    center: z.string().transform((val) => {
      const parts = val.split(',').map((v) => parseFloat(v));
      return {
        longitude: parts[0],
        latitude: parts[1],
        zoom: parts[2],
      };
    }),
    bounds: boundsTransform,
    antimeridian_adjusted_bounds: boundsTransform,
    type: z.string(),
    format: z.string(),
    generator: z.string(),
    generator_options: z.string(),
    json: z.string().transform((val) => metadataJsonSchema.parse(JSON.parse(val))),
  })
  .transform(({ json, minzoom, maxzoom, antimeridian_adjusted_bounds, ...val }) => {
    return {
      ...val,
      ...json,
      minZoom: minzoom,
      maxZoom: maxzoom,
      antimeridianAdjustedBounds: antimeridian_adjusted_bounds,
    };
  });

export { metadataSchema as vectorTileMetadataSchema };
