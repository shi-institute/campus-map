import { exec } from './exec.js';

/**
 * Uses ogrinfo to get the feature count of the first layer in a vector file.
 */
export async function getFirstLayerFeatureCount(layerPath: string) {
  const stdout = await exec(
    `ogrinfo -ro -al -geom=NO "${layerPath}" | grep '^Feature Count:' | awk '{print $3}'`,
    false,
    true
  );
  if (!stdout) {
    throw new Error(`Failed to get feature count for path: ${layerPath}`);
  }

  const featureCount = parseInt(stdout.trim(), 10);
  if (isNaN(featureCount)) {
    throw new Error(`Could not parse feature count from ogrinfo output for path: ${layerPath}`);
  }

  return featureCount;
}
