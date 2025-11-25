import knex from 'knex';
import { Pool } from 'pg';
import { getKartDatabaseConnectionString } from './getKartDatabaseConnectionString.js';

export const kartDatabasePool = new Pool({ connectionString: getKartDatabaseConnectionString() });

export const kartKnex = knex({
  client: 'pg',
  connection: getKartDatabaseConnectionString(),
});
