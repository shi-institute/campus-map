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
import registerQueryRoute, { executeSplitQuery, pointToPointRoutingQuery } from './query.js';

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

  const variableValues: Record<`$${string}`, string | number> = {
    '$startLongitude': startX,
    '$startLatitude': startY,
    '$startSRID': srid,
    '$endLongitude': endX,
    '$endLatitude': endY,
    '$endSRID': srid,
  };

  // replace variables in the SQL query
  const sql = Object.entries(variableValues).reduce(
    (accSql, [varName, varValue]) => accSql.replaceAll(varName, varValue.toString()),
    pointToPointRoutingQuery(format)
  );

  return executeSplitQuery(sql, format === 'geojson').then(result => result.featureCollection)
}
