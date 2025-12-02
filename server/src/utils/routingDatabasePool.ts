import { Pool } from 'pg';
import { constants } from './constants.js';

export const routingDatabasePool = new Pool({ connectionString: getRoutingDatabaseConnectionString() });

function getRoutingDatabaseConnectionString() {
  const url = new URL(
    `postgresql://${constants.database.host}:${constants.database.port}/${constants.database.routingdatabase}`
  );
  url.username = constants.database.username;
  url.password = constants.database.password;
  return url.toString();
}
