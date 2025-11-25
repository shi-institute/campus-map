import Router from '@koa/router';
import { readFile } from 'fs/promises';
import path from 'path';
import { vectorTileMetadataSchema } from '../../../utils/generateVectorTiles.js';
import { constructArcGisWebMap, jsonToArcGisHtml } from '../../../utils/index.js';

export default (router: Router, tileFolder: string, serviceRootPathname: string) => {
  // serve VectorTileServer.json
  router.get('/', async (ctx) => {
    const host = ctx.request.header.host;
    const protocol = ctx.request.protocol;
    const baseUrl = `${protocol}://${host}`;
    const currentUrl = baseUrl + ctx.request.path;
    const format = ctx.request.query.f;

    if (format === 'jsapi') {
      ctx.type = 'text/html';
      console.log('Current URL:', currentUrl);
      ctx.body = constructArcGisWebMap('Furman University Campus Map (VectorTileServer)', currentUrl);
      return;
    }

    const vectorTileServerJsonPath = `${tileFolder}/VectorTileServer.json`;
    const serverJson = JSON.parse(await readFile(vectorTileServerJsonPath, 'utf-8'));

    const tilesMetadataPath = path.join(tileFolder, 'tile', 'metadata.json');
    const tilesMetadata = await readFile(tilesMetadataPath, 'utf-8')
      .then((data) => JSON.parse(data))
      .then((json) => vectorTileMetadataSchema.parse(json));

    if (ctx.request.accepts('text/html') && format !== 'json' && format !== 'pjson') {
      ctx.type = 'text/html';
      ctx.body = jsonToArcGisHtml(
        {
          data: serverJson,
          center: tilesMetadata.center,
        },
        {
          serviceRootPathname,
          currentUrl: new URL(currentUrl),
        }
      );
    } else if (format === 'pjson') {
      ctx.type = 'text/plain';
      ctx.body = JSON.stringify(serverJson, null, 2);
    } else {
      ctx.type = 'application/json';
      ctx.body = JSON.stringify(serverJson);
    }
  });

  // serve individual vector tiles
  router.get('/tile/:z/:x/:y.pbf', async (ctx) => {
    const { z, x, y } = ctx.params;
    const tilePath = path.join(tileFolder, 'tile', z || '0', x || '0', `${y || 0}.pbf`);
    try {
      const tileData = await readFile(tilePath);
      ctx.type = 'application/vnd.mapbox-vector-tile';
      ctx.set('Content-Encoding', 'gzip');
      ctx.body = tileData;
    } catch (error) {
      ctx.status = 404;
      ctx.body = 'Tile not found';
    }
  });

  // serve any style files
  router.get('/resources/styles/:styleFile', async (ctx) => {
    // construct the current URL for resolving relative paths
    const host = ctx.request.header.host;
    const isLocalHost = host?.startsWith('localhost') || host?.startsWith('127.0.0.1');
    const protocol = ctx.request.protocol;
    const baseUrl = `${protocol === 'http' && !isLocalHost ? 'https' : protocol}://${host}`;
    const currentUrl = baseUrl + ctx.request.path;

    const format = ctx.request.query.f;
    const isFromArcGisVectorTileServer = format === 'json'; // esri clients use f=json

    try {
      // read the style file
      const { styleFile } = ctx.params;
      const styleFilePath = `${tileFolder}/resources/styles/${styleFile}`;
      const styleData = await readFile(styleFilePath, 'utf-8');
      const styleJson = JSON.parse(styleData);

      // arcgis vector tile server clients do not need absolute paths
      if (isFromArcGisVectorTileServer) {
        ctx.type = 'application/json';
        ctx.body = JSON.stringify(styleJson);
        return;
      }

      // resolve relative URLs in style JSON
      if (styleJson.sources) {
        for (const sourceKey in styleJson.sources) {
          const source = styleJson.sources[sourceKey];
          if (source.type === 'vector' && source.url) {
            source.url = undefined; // unlink reference to ArcGIS VectorTileServer
          }
          if (source.type === 'vector' && source.tiles) {
            source.tiles = source.tiles.map((tileUrl: string) => {
              if (tileUrl.startsWith('../../')) {
                // resolve relative path using currentUrl and tileUrl
                const resolved = new URL(tileUrl, currentUrl)
                  .toString()
                  .replace(/%7B/g, '{')
                  .replace(/%7D/g, '}');
                return resolved;
              }
              return tileUrl;
            });
          }
        }
      }

      ctx.type = 'application/json';
      ctx.body = JSON.stringify(styleJson);
    } catch (error) {
      ctx.status = 404;
      ctx.body = 'Style file not found';
    }
  });

  // redirect /resources/styles to default style (for ArcGIS Pro compatibility)
  router.get('/resources/styles', async (ctx) => {
    ctx.redirect(`${ctx.request.path}/root.json?f=esrivts`);
  });
};
