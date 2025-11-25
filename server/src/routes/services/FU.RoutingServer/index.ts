import Router from '@koa/router';

export default (router: Router) => {
  router.get('/', async (ctx) => {
    ctx.body = 'Not implemented';
    ctx.status = 404;
  });
};
