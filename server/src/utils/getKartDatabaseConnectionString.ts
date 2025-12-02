import { constants } from './constants.js';

export function getKartDatabaseConnectionString(includeSchema = false) {
  const url = new URL(
    `postgresql://${constants.database.host}:${constants.database.port}/${constants.database.geodatabase}${
      includeSchema ? `/${constants.database.geoschema}` : ''
    }`
  );
  url.username = constants.database.username;
  url.password = constants.database.password;
  return url.toString();
}
