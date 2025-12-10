import Router from '@koa/router';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { koop } from '../../../index.js';
import {
  constants,
  constructArcGisWebMap,
  jsonToArcGisHtml,
  unwrapServiceName,
} from '../../../utils/index.js';

export default (router: Router, serviceFolder: string, serviceRootPathname: string) => {
  const servicePath = serviceFolder.replace(constants.fileBasedServicesDataFolder, '');

  const isKartSource = servicePath.startsWith('data/');
  const isRoutingSource = servicePath.startsWith('routing/');
  if (!isKartSource && !isRoutingSource) {
    throw new Error(`Service folder ${serviceFolder} is not a valid Kart or routing source.`);
  }

  const serviceSubpath = serviceFolder.replace(
    constants.fileBasedServicesDataFolder + (isKartSource ? 'data/' : 'routing/'),
    ''
  );
  const koopPath = `/${
    isKartSource ? constants.koopKartProviderId : constants.koopRoutingProviderId
  }/rest/services/${serviceSubpath}/FeatureServer`;

  // serve FeatureServer from koop
  router.get('/', async (ctx) => {
    const host = ctx.request.header.host;
    const protocol = ctx.request.protocol;
    const baseUrl = `${protocol}://${host}`;
    const currentUrl = baseUrl + ctx.request.path;
    const format = ctx.request.query.f;

    const serviceName = unwrapServiceName(serviceSubpath);

    if (format === 'jsapi') {
      ctx.type = 'text/html';
      ctx.body = constructArcGisWebMap('data/' + serviceName, currentUrl);
      return;
    }

    if (format === 'pitemx') {
      ctx.type = 'application/octet-stream';
      ctx.set('Content-Disposition', `attachment; filename="${serviceName}.pitemx"`);
      ctx.body = JSON.stringify({
        title: serviceName,
        type: 'Feature Service',
        url: currentUrl,
      });
      return;
    }

    if (ctx.request.accepts('text/html') && format !== 'json' && format !== 'pjson') {
      // query the koop-postgres-provider for the FeatureServer JSON
      const serverJsonUrl = new URL(koopPath, baseUrl);
      serverJsonUrl.searchParams.set('f', 'json');
      const serverJson = await getJson(koop.server, serverJsonUrl);

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
    } else {
      ctx.path = koopPath;
      ctx.respond = false; // let Express handle the raw response
      koop.server.handle(ctx.req as IncomingMessage, ctx.res as ServerResponse);
    }
  });

  router.use((ctx, next) => {
    if (ctx.path.startsWith('/rest/services/data/')) {
      // rewrite to remove 'data' from the path, since koop-postgres-provider
      // serves data at /f3692c88-163b-41a8-8341-c64c16a1e8a9/rest/services/:provider/:id/FeatureServer
      ctx.path = ctx.path.replace('/rest/services/data/', `/${constants.koopKartProviderId}/rest/services/`);
    }

    if (ctx.path.startsWith('/rest/services/routing/')) {
      // rewrite to remove 'routing' from the path, since koop-postgres-provider
      // serves data at /120eb65f-9e43-4623-9e72-259916d5b736/rest/services/:provider/:id/FeatureServer
      ctx.path = ctx.path.replace(
        '/rest/services/routing/',
        `/${constants.koopRoutingProviderId}/rest/services/`
      );
    }

    ctx.respond = false; // let Express handle the raw response
    koop.server.handle(ctx.req as IncomingMessage, ctx.res as ServerResponse);
  });
};

function getJson(app: import('@koopjs/koop-core').default['server'], url: URL) {
  return new Promise<any>((resolve, reject) => {
    // build a fake request
    const req = new Readable() as IncomingMessage;
    req.url = url.pathname + url.search;
    req.method = 'GET';
    req.headers = { accept: 'application/json' };

    // build a minimal response implementation
    const res = new ServerResponse(req);

    const chunks: Buffer[] = [];
    const originalResponseEnd = res.end;

    // capture written data
    res.write = (chunk: any) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    };

    // when the response ends, parse the captured data as JSON
    res.end = (chunk?: any, ...args: any[]) => {
      // capture the final chunk
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      // parse the full response
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }

      // call the original end method
      return originalResponseEnd.apply(res, [chunk, ...args] as any);
    };

    try {
      app.handle(req, res);
    } catch (err) {
      reject(err);
    }
  });
}
