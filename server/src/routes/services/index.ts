import Router from '@koa/router';
import { constants } from '../../utils/constants.js';
import { inferServiceResponseFormat } from '../../utils/index.js';
import { discoverServices } from './discoverServices.js';
import registerFeatureServiceRoutes from './FeatureServer/index.js';
import registerRoutingServiceRoutes from './FU.RoutingServer/index.js';
import { generateArcGisHtmlIndex } from './generateArcGisHtmlIndex.js';
import registerVectorTileServiceRoutes from './VectorTileServer/index.js';

export default async (router: Router) => {
  // get the root of the router
  const serviceRootPathname = router.opts.prefix;
  if (!serviceRootPathname) {
    throw new Error('Services router must have a prefix defined.');
  }

  // find all valid services
  const services = await discoverServices(constants.fileBasedServicesDataFolder);

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
  router.get(['/', '*path'], async (ctx) => {
    const format = inferServiceResponseFormat(ctx);

    // get the folders and services in this directory
    const { folders, services: servicesInDir } = services.forDirectory(ctx.params.path || '');
    if (folders.length === 0 && servicesInDir.length === 0) {
      ctx.status = 404;
      ctx.body = '404 Not Found';
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
};
