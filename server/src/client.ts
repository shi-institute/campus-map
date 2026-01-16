import type Koa from 'koa';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  build as buildViteApp,
  createServer as createViteServer,
} from '../../client/node_modules/vite/dist/node/index.js';

const clientViteConfig = {
  root: '/app/client',
  configFile: '/app/client/vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom', // disable Vite's default HTML serving logic
  base: '/',
  envDir: '/app/client',
  build: {
    outDir: '/app/server/dist/frontend',
  },
} satisfies Parameters<typeof createViteServer>[0];

export default async (ctx: Koa.Context) => {
  const app = ctx.app;

  // in production mode, serve the built client files
  if (process.env.NODE_ENV === 'production') {
    // configure Koa to serve any file from the client dist folder
    app.use(async (ctx, next) => {
      const filePath = path.join('/app/server/dist/frontend', decodeURIComponent(ctx.path));
      try {
        ctx.type = path.extname(filePath);
        ctx.body = await readFile(filePath);
      } catch (err) {
        await next();
      }
    });

    // configure Koa to serve the entry index.html for any other request
    app.use(async (ctx) => {
      const indexPath = path.join('/app/server/dist/frontend', 'index.html');
      ctx.type = 'text/html';
      ctx.body = await readFile(indexPath, 'utf8');
    });
  }

  // start the dev server for client
  const clientDevServer = await createViteServer(clientViteConfig);

  // attach the client dev server as middleware, allowing
  // all requests that do not match other routes to be handled by
  // the client dev server (for assets, HMR, etc)
  app.use(async (ctx, next) => {
    await new Promise<void>((resolve, reject) => {
      clientDevServer.middlewares(ctx.req, ctx.res, (err: unknown) => (err ? reject(err) : resolve()));
    });
    await next();
  });

  // configure Koa to serve the entry index.html for any other request
  app.use(async (ctx) => {
    const url = ctx.path;
    try {
      let template = await clientDevServer.transformIndexHtml(
        url,
        await readFile('./client/index.html', 'utf8')
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
};

export async function buildFrontend() {
  await buildViteApp(clientViteConfig);
}
