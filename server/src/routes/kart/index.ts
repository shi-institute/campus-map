import Router from '@koa/router';
import { z } from 'zod';
import { constants, generateVectorTilesForDbGeometryTables } from '../../utils/index.js';
import { pullLatestChangesForKart } from './pullLatestChangesForKart.js';

export default (router: Router) => {
  router.post('/webhooks/push', async (ctx) => {
    const body = webhookPushSchema.parse(ctx.request.body);

    // verify repository and branch
    if (body.repository.full_name !== process.env.DATA_REPOSITORY || body.ref !== 'refs/heads/main') {
      ctx.status = 400;
      ctx.body = 'Invalid repository or branch';
      return;
    }

    // update the local database with the latest changes from the repository
    try {
      await pullLatestChangesForKart();
    } catch (error) {
      ctx.status = 500;
      if (error instanceof Error) {
        ctx.body = `Failed to pull latest changes: ${error.message}`;
      } else {
        ctx.body = 'Failed to pull latest changes: Unknown error';
      }
      console.error('Error pulling latest changes for Kart:', error);
      return;
    }

    // update the vector tiles
    try {
      await generateVectorTilesForDbGeometryTables(constants.campusMapVectorTilesOutputFolder);
    } catch (error) {
      ctx.status = 500;
      if (error instanceof Error) {
        ctx.body = `Failed to generate vector tiles: ${error.message}`;
      } else {
        ctx.body = 'Failed to generate vector tiles: Unknown error';
      }
      console.error('Error generating vector tiles for Kart:', error);
      return;
    }

    ctx.status = 200;
    return;
  });

  router.get('/status', async (ctx) => {
    ctx.body = 'Kart service is running';
    console.log('Kart status checked');
  });
};

const webhookPushSchema = z
  .object({
    ref: z.string(),
    repository: z.object({
      full_name: z.string(),
    }),
  })
  .passthrough();
