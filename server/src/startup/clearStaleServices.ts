import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { constants } from '../utils/index.js';

/**
 * Clears all stale services by removing all contents inside
 * the file-based services data folder.
 */
export async function clearStaleServices() {
  console.log('Removing stale services...');

  if (existsSync(constants.fileBasedServicesDataFolder)) {
    await rm(constants.fileBasedServicesDataFolder, { recursive: true, force: true });
  }

  console.log('Cleared stale services.');
}
