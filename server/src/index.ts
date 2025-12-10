import cors from '@koa/cors';
import Router from '@koa/router';
import Koop from '@koopjs/koop-core';
import OutputGeoservices from '@koopjs/output-geoservices';
import * as crypto from 'crypto';
import dotenv from 'dotenv';
import { IncomingMessage, ServerResponse } from 'http';
import Koa from 'koa';
import bodyParser from 'koa-body';
import koopPostgresProvider from 'koop-provider-pg';
import registerKartRoutes from './routes/kart/index.js';
import registerServicesRoutes from './routes/services/index.js';
import initialize from './startup/index.js';
import { constants } from './utils/index.js';

// we use koop to provide ArcGIS-compatible services for the tables stored in
// the database populated by Kart
export const koop = new Koop();
koop.register(OutputGeoservices, {
  // see https://github.com/koopjs/koop/blob/2a121fea5bb0a802088db412decd5b925d87760b/packages/output-geoservices/README.md?plain=1#L31
  defaults: {
    currentVersion: 11.5,
    fullVersion: '11.5.0',
  },
});
koop.register(koopPostgresProvider, {
  name: constants.koopKartProviderId,
  host: constants.database.host,
  port: constants.database.port,
  database: constants.database.geodatabase,
  user: constants.database.username,
  password: constants.database.password,
  objectIdField: 'fid',
  pgLimit: 1000000,
});
koop.register(koopPostgresProvider, {
  name: constants.koopRoutingProviderId,
  host: constants.database.host,
  port: constants.database.port,
  database: constants.database.routingdatabase,
  user: constants.database.username,
  password: constants.database.password,
  objectIdField: 'id',
  pgLimit: 1000000,
});

// load environment variables from .env file
dotenv.config({ override: true, quiet: true });
if (!process.env.DATA_REPOSITORY) {
  throw new Error('DATA_REPOSITORY environment variable is not set.');
}

await initialize();
const app = new Koa();
const router = new Router();

app.use(async (ctx, next) => {
  console.log(`${ctx.method} ${ctx.url}`);
  await next();
});

app.use(
  cors({
    origin: (ctx) => {
      // allow GitHub origin for webhook request
      if (ctx.request.path === '/kart/webhooks/push') {
        return 'https://api.github.com';
      }

      // allow vector tile requests from https://maplibre.org/maputnik
      if (
        ctx.request.get('Origin') === 'https://maplibre.org' &&
        ctx.request.path.startsWith('/rest/services') &&
        ctx.request.path.includes('/VectorTileServer')
      ) {
        return 'https://maplibre.org';
      }

      // if in development, allow localhost origins
      if (process.env.NODE_ENV === 'development') {
        const requestOrigin = ctx.request.get('Origin');
        if (requestOrigin.startsWith('http://localhost')) {
          return requestOrigin;
        }
      }

      return '';
    },
    allowMethods: ['GET', 'POST'], // defaults to GET, HEAD, PUT, POST, DELETE, PATCH
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use(bodyParser({ includeUnparsed: true, json: true }));

// validate GitHub webhook signatures
app.use(async (ctx, next) => {
  if (ctx.request.method !== 'POST' || ctx.request.path !== '/kart/webhooks/push') {
    ctx.request.rawBody = undefined;
    await next();
    return;
  }

  // read the expected signature from the headers
  const signature = ctx.get('X-Hub-Signature-256');
  if (!signature) {
    ctx.request.rawBody = undefined;
    ctx.status = 401;
    ctx.body = 'Missing signature';
    return;
  }

  // verify that the body matches the signature when we locally compute it
  const hmac = crypto
    .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET || '')
    .update(ctx.request.rawBody || '', 'utf8')
    .digest('hex');
  const expectedSignature = `sha256=${hmac}`;
  if (signature !== expectedSignature) {
    ctx.request.rawBody = undefined;
    ctx.status = 401;
    ctx.body = 'Invalid signature';
    return;
  }

  ctx.request.rawBody = undefined;
  await next();
});

router.get('/', async (ctx) => {
  ctx.body = 'Furman University Campus Map Server is running.';
  ctx.redirect('/rest/services');
});

app.use(router.routes());
app.use(router.allowedMethods());

const kartRouter = new Router({ prefix: '/kart' });
registerKartRoutes(kartRouter);
app.use(kartRouter.routes());

const servicesRouter = new Router({ prefix: '/rest/services' });
await registerServicesRoutes(servicesRouter);
app.use(servicesRouter.routes());

router.get('/rest/info', (ctx) => {
  // rewrite to match koop-postgres-provider's provider name
  ctx.path = `/${constants.koopKartProviderId}/rest/info`;
  ctx.respond = false; // let Express handle the raw response
  koop.server.handle(ctx.req as IncomingMessage, ctx.res as ServerResponse);
});

app.listen(3000);
