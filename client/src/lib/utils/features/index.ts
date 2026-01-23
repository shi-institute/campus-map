export { convertMultiLineStringToLineStrings } from './convertMultiLineStringToLineStrings.js';
export { getFeatureFromService } from './getFeatureFromService.js';
export { getFeatureServiceDetails } from './getFeatureServiceDetails.js';
export { reprojectFeature } from './reprojectFeature.js';
export { transformCoordinates } from './transformCoordinates.js';

// register all EPSG codes
import epsg from 'epsg-index/all.json';
import proj4 from 'proj4';
for (const code in epsg) {
  proj4.defs(`EPSG:${code}`, (epsg as any)[code].proj4);
}
