import path from 'node:path';

const fileBasedServicesDataFolder = '/app/server/data/services/';
const databaseGeometryExportFolder = '/app/server/fgb-exports/';
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

export const constants = {
  fileBasedServicesDataFolder,
  databaseGeometryExportFolder,
  servicesDirectoryTitle,
  campusMapVectorTilesOutputFolder,
  database,
};
