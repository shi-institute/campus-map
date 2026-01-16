import path from 'node:path';

const fileBasedServicesDataFolder = '/tmp/app/server/data/services/';
const databaseGeometryExportFolder = '/tmp/app/server/fgb-exports/';
const servicesDirectoryTitle = 'Services Directory';
const campusMapVectorTilesOutputFolder = path.join(fileBasedServicesDataFolder, '/FurmanCampusMap/');
const database = {
  host: 'localhost',
  port: 5432,
  username: 'campusmap',
  password: 'password',
  geodatabase: 'kart',
  geoschema: 'data',
  routingdatabase: 'routing',
};
const koopKartProviderId = 'f3692c88-163b-41a8-8341-c64c16a1e8a9';
const koopRoutingProviderId = '120eb65f-9e43-4623-9e72-259916d5b736';

export const constants = {
  fileBasedServicesDataFolder,
  databaseGeometryExportFolder,
  servicesDirectoryTitle,
  campusMapVectorTilesOutputFolder,
  database,
  koopKartProviderId,
  koopRoutingProviderId,
};
