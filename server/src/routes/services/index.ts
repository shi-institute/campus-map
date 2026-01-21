import Router from '@koa/router';
import { initEvents } from '../../startup/index.js';
import { constants } from '../../utils/constants.js';
import { generateServiceDirectoryHeader, inferServiceResponseFormat, initDoc } from '../../utils/index.js';
import { discoverServices } from './discoverServices.js';
import registerFeatureServiceRoutes from './FeatureServer/index.js';
import registerRoutingServiceRoutes from './FU.RoutingServer/index.js';
import { generateArcGisHtmlIndex } from './generateArcGisHtmlIndex.js';
import registerVectorTileServiceRoutes from './VectorTileServer/index.js';

export default async (router: Router) => {
  async function registerRoutes() {
    // get the root of the router
    const serviceRootPathname = router.opts.prefix;
    if (!serviceRootPathname) {
      throw new Error('Services router must have a prefix defined.');
    }

    // find all valid services
    const services = await discoverServices(constants.fileBasedServicesDataFolder);

    // clear existing routes
    router.stack = [];

    // register all vector tile services recursively
    services.all
      .filter((service) => service.type === 'VectorTileServer')
      .forEach((service) => {
        const serviceRouter = new Router({ prefix: service.pathname });
        registerVectorTileServiceRoutes(serviceRouter, service.path, serviceRootPathname);
        router.use(serviceRouter.routes());
      });

    // register all FU.RoutingServer services recursively
    services.all
      .filter((service) => service.type === 'FU.RoutingServer')
      .forEach((service) => {
        const serviceRouter = new Router({ prefix: service.pathname });
        registerRoutingServiceRoutes(serviceRouter, service.path, serviceRootPathname);
        router.use(serviceRouter.routes());
      });

    // register all FeatureServer services recursively
    services.all
      .filter((service) => service.type === 'FeatureServer')
      .forEach((service) => {
        const serviceRouter = new Router({ prefix: encodeURI(service.pathname) });
        registerFeatureServiceRoutes(serviceRouter, service.path, serviceRootPathname);
        router.use(serviceRouter.routes());
      });

    // allow browsing the list of services and folders
    router.all(['/', '*path'], async (ctx) => {
      const format = inferServiceResponseFormat(ctx);

      // get the folders and services in this directory
      const { folders, services: servicesInDir } = services.forDirectory(ctx.params.path || '');

      // if no folder or services found AND not the root, return 404
      if (folders.length === 0 && servicesInDir.length === 0 && ctx.request.path !== serviceRootPathname) {
        const responseData = {
          error: {
            code: 404,
            message: 'Folder not found',
          },
        };

        if (format === 'json') {
          ctx.type = 'application/json';
          ctx.body = JSON.stringify(responseData);
          return;
        }

        if (format === 'pjson') {
          ctx.type = 'text/plain';
          ctx.body = JSON.stringify(responseData, null, 2);
          return;
        }

        ctx.type = 'text/html';
        ctx.body = (() => {
          const { document, body, titleElement } = initDoc('404 Not Found');

          // write header
          const headerTables = generateServiceDirectoryHeader(
            { document, user: ctx.state.user },
            { serviceRootPathname: '/rest/services', currentPathname: ctx.path }
          );
          headerTables.forEach((table) => body.appendChild(table));
          body.appendChild(titleElement);

          // body
          const rbody = document.createElement('div');
          rbody.setAttribute('class', 'rbody');
          body.appendChild(rbody);

          // access denied message
          const messageElement = document.createElement('p');
          messageElement.appendChild(
            document.createTextNode('The requested endpoint does not exist or requires authentication.')
          );
          rbody.appendChild(messageElement);

          return document.toString();
        })();
        return;
      }

      // send appropriate response type
      const responseData = {
        currentVersion: 11.5,
        folders,
        services: servicesInDir,
        user: ctx.state.user,
      };

      if (format === 'html') {
        ctx.type = 'text/html';
        ctx.body = generateArcGisHtmlIndex(responseData, {
          serviceRootPathname,
          currentPathname: ctx.request.path,
        });
        return;
      }

      if (format === 'pjson') {
        ctx.type = 'text/plain';
        ctx.body = JSON.stringify(responseData, null, 2);
        return;
      }

      ctx.type = 'application/json';
      ctx.body = JSON.stringify(responseData);
    });
  }

  await registerRoutes();

  initEvents.on('servicesdirectoryupdated', () => {
    try {
      registerRoutes();
    } catch (error) {
      console.error('Error re-registering service routes:', error);
    }
  });
};
