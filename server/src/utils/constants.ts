import path from 'node:path';

const fileBasedServicesDataFolder = '/app/server/data/services/';
const tileGeometryExportFolder = '/app/server/fgb-exports/';
const servicesDirectoryTitle = 'Services Directory';
const campusMapVectorTilesOutputFolder = path.join(fileBasedServicesDataFolder, '/FurmanCampusMap/');

export const constants = {
  fileBasedServicesDataFolder,
  tileGeometryExportFolder,
  servicesDirectoryTitle,
  campusMapVectorTilesOutputFolder,
};
