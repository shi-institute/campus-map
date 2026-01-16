import cors from '@koa/cors';
import Router from '@koa/router';
import Koop from '@koopjs/koop-core';
import OutputGeoservices from '@koopjs/output-geoservices';
import * as crypto from 'crypto';
import { readFile } from 'fs/promises';
import Koa from 'koa';
import bodyParser from 'koa-body';
import koopPostgresProvider from 'koop-provider-pg';
import path from 'node:path';
import {
  build as buildViteApp,
  createServer as createViteServer,
} from '../../client/node_modules/vite/dist/node/index.js';
import frontend from './client.js';
import registerAuthRoutes from './routes/auth/index.js';
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

if (!process.env.DATA_REPOSITORY) {
  throw new Error('DATA_REPOSITORY environment variable is not set.');
}

await initialize();
const app = new Koa();
const router = new Router();

app.proxy = true; // trust X-Forwarded-* headers

app.use(async (ctx, next) => {
  let url = ctx.url;

  // redact token query parameter from logs
  url = url.replace(/([?&])token=[^&]*/gi, '$1token=REDACTED');
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

const authRouter = new Router();
registerAuthRoutes(authRouter, app);
app.use(authRouter.routes());

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

router.get('/status', async (ctx) => {
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
  const host = ctx.request.header.host;
  const protocol = ctx.request.protocol;
  const baseUrl = `${protocol}://${host}`;

  const json = {
    currentVersion: 11.5,
    fullVersion: '11.5.0',
    authInfo: {
      isTokenBasedSecurity: true,
      shortLivedTokenValidity: 60,
      tokenServicesUrl: baseUrl + '/tokens',
    },
    secureSoapUrl: null,
    soapUrl: null,
  };

  ctx.type = 'application/json';
  ctx.body = JSON.stringify(json);
});

const clientViteConfig = {
  root: '/app/client',
  configFile: '/app/client/vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom', // disable Vite's default HTML serving logic
  base: '/',
  envDir: '/app/client',
} satisfies Parameters<typeof createViteServer>[0];

if (process.env.NODE_ENV !== 'production') {
  // start the dev server for client and proxy requests to it in development
  // if (process.env.NODE_ENV === 'development') {
  const clientDevServer = await createViteServer(clientViteConfig);

  // attach vite's middleware
  app.use(async (ctx, next) => {
    await new Promise<void>((resolve, reject) => {
      clientDevServer.middlewares(ctx.req, ctx.res, (err: unknown) => (err ? reject(err) : resolve()));
    });
    await next();
  });

  // serve client/frontend if no other route matched
  app.use(async (ctx) => {
    const url = ctx.path;
    try {
      let template = await clientDevServer.transformIndexHtml(
        url,
        await readFile('../client/index.html', 'utf8')
      );
      ctx.type = 'text/html';
      ctx.body = template;
    } catch (error) {
      ctx.status = 500;
      if (error instanceof Error) {
        clientDevServer.ssrFixStacktrace(error);
        ctx.body = error.message;
      } else {
        ctx.body = error;
      }
      console.error(error);
    }
  });
} else {
  await buildViteApp(clientViteConfig);

  // serve any file from the client dist folder
  app.use(async (ctx, next) => {
    const filePath = path.join('/app/client/dist', decodeURIComponent(ctx.path));
    try {
      ctx.type = path.extname(filePath);
      ctx.body = await readFile(filePath);
    } catch (err) {
      await next();
    }
  });

  // serve client/frontend if no other route matched
  app.use(async (ctx) => {
    const indexPath = path.join('/app/client/dist', 'index.html');
    ctx.type = 'text/html';
    ctx.body = await readFile(indexPath, 'utf8');
  });
}

app.use(frontend);

app.listen(3000);
