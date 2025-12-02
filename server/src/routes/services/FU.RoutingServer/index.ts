import Router from '@koa/router';
import { readFile } from 'fs/promises';
import { z } from 'zod';
import { jsonToArcGisHtml, routingDatabasePool } from '../../../utils/index.js';

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
      ctx.body = { error: (error as Error).message };
      ctx.status = 500;
    }
  });
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
             edge_id AS id, 
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
      edges.edge_id AS edge_id,
      route.node AS edge_end_vertex_id,
      route.cost AS edge_cost,
      ${format === 'table' ? 'edges.geom' : 'ST_AsGeoJSON(edges.geom)::jsonb'} AS geometry
    FROM route
    JOIN edges
      ON edges.edge_id = route.edge
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
