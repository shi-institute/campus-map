import { exec } from './index.js';

/**
 * Uses ogrinfo to get the name of the first layer in a vector file.
 */
export async function getFirstLayerName(layerPath: string) {
  const stdout = await exec(`ogrinfo "${layerPath}"`, false, true);
  if (!stdout) {
    throw new Error(`Failed to get layer name for path: ${layerPath}`);
  }

  // Match something like: "1: 4WD [Road] (Multi Line String)"
  const layerNameMatch = stdout.match(/^\s*\d+:\s*(.+?)\s*\(/m);
  if (!layerNameMatch || layerNameMatch.length < 2) {
    throw new Error(`Could not parse layer name from ogrinfo output for path: ${layerPath}`);
  }

  return layerNameMatch[1];
}
