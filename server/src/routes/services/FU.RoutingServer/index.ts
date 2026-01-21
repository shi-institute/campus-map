import Router from '@koa/router';
import { readFile } from 'fs/promises';
import { z } from 'zod';
import {
  generateServiceDirectoryHeader,
  inferServiceResponseFormat,
  initDoc,
  jsonToArcGisHtml,
  routingDatabasePool,
} from '../../../utils/index.js';
import registerQueryRoute from './query.js';

export default (router: Router, serviceFolder: string, serviceRootPathname: string) => {
  // serve FU.RoutingServer.json
  router.get('/', async (ctx) => {
    const host = ctx.request.header.host;
    const protocol = ctx.request.protocol;
    const baseUrl = `${protocol}://${host}`;
    const currentUrl = baseUrl + ctx.request.path;
    const format = ctx.request.query.f;

    const serviceJsonPath = `${serviceFolder}/FU.RoutingServer.json`;
    const serverJson = JSON.parse(await readFile(serviceJsonPath, 'utf-8'));

    if (ctx.request.accepts('text/html') && format !== 'json' && format !== 'pjson') {
      ctx.type = 'text/html';
      ctx.body = jsonToArcGisHtml(
        {
          data: serverJson,
          user: ctx.state.user,
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

  router.post('/solve', async (ctx) => {
    const params = solveRouteParamsSchema.parse(ctx.request.body);
    const format = (ctx.request.query.format as string) === 'table' ? 'table' : 'geojson';

    try {
      ctx.body = await solveRoute(params, format);
      ctx.status = 200;
    } catch (error) {
      console.error('Error solving route:', error);
      ctx.body = { error: (error as Error).message };
      ctx.status = 500;
    }
  });

  router.get('/solve', async (ctx) => {
    const format = inferServiceResponseFormat(ctx);
    ctx.status = 400;

    if (format !== 'html') {
      ctx.type = format === 'json' ? 'application/json' : 'text/plain';
      ctx.body = {
        error: 'This operation is only available via POST requests.',
      };
      return;
    }

    const { document, body, titleElement } = initDoc('Solve Route');

    // write header
    const headerTables = generateServiceDirectoryHeader(
      { document, user: ctx.state.user },
      {
        serviceRootPathname: '/rest/services',
        currentPathname: ctx.path,
      }
    );
    headerTables.forEach((table) => body.appendChild(table));
    body.appendChild(titleElement);

    const rbody = document.createElement('div');
    rbody.setAttribute('class', 'rbody');
    body.appendChild(rbody);

    const errorDiv = document.createElement('div');
    errorDiv.setAttribute('style', 'color:#ff6666');
    errorDiv.appendChild(document.createTextNode('This operation is only available via POST requests.'));
    const br = document.createElement('br');
    errorDiv.appendChild(br);
    rbody.appendChild(errorDiv);

    ctx.type = 'text/html';
    ctx.body = document.toString();
  });

  if (process.env.NODE_ENV === 'development') {
    registerQueryRoute(router);
  }
};

interface SolveRouteParams {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  crs: string;
}

const solveRouteParamsSchema = z.object({
  startX: z.number(),
  startY: z.number(),
  endX: z.number(),
  endY: z.number(),
  crs: z.string(),
});

async function solveRoute(
  { startX, startY, endX, endY, crs }: SolveRouteParams,
  format: 'geojson' | 'table' = 'geojson'
) {
  const srid = parseInt(crs.replace('EPSG:', ''), 10);

  const sql = `
    WITH
      closest_start_vertex AS (
        SELECT id
        FROM vertices
        ORDER BY geom <-> ST_Transform(
          ST_SetSRID(ST_MakePoint($1, $2), $3),
          (SELECT Find_SRID('public', 'edges', 'geom'))
        )
        LIMIT 1
      ),
      closest_end_vertex AS (
        SELECT id
        FROM vertices
        ORDER BY geom <-> ST_Transform(
          ST_SetSRID(ST_MakePoint($4, $5), $6),
          (SELECT Find_SRID('public', 'edges', 'geom'))
        )
        LIMIT 1
      ),
      route AS (
        SELECT *
        FROM pgr_dijkstra(
          'SELECT 
             id AS id, 
             start_vertex AS source, 
             end_vertex AS target, 
             cost__distance AS cost, 
             reverse_cost__distance AS reverse_cost 
           FROM edges',
          (SELECT id FROM closest_start_vertex),
          (SELECT id FROM closest_end_vertex),
          directed := true
        )
      )
    SELECT
      route.seq AS step,
      edges.id AS edge_id,
      route.node AS edge_end_vertex_id,
      route.cost AS edge_cost,
      ${format === 'table' ? 'edges.geom' : 'ST_AsGeoJSON(edges.geom)::jsonb'} AS geometry
    FROM route
    JOIN edges
      ON edges.id = route.edge
    WHERE route.edge <> -1
    ORDER BY route.seq;
  `;

  const values = [startX, startY, srid, endX, endY, srid];

  const client = await routingDatabasePool.connect();

  try {
    const res = await client.query(sql, values);

    if (format === 'table') {
      return res.rows;
    }

    // convert rows to GeoJSON FeatureCollection
    const features = res.rows.map(({ geometry, ...properties }) => ({
      type: 'Feature',
      geometry,
      properties,
    }));

    const featureCollection = {
      type: 'FeatureCollection',
      features,
    };

    return featureCollection;
  } finally {
    client.release();
  }
}
