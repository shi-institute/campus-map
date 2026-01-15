import config from 'config';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { constants, exec, generateServiceFiles, getKartDatabaseConnectionString } from '../utils/index.js';
import { initEvents } from './index.js';

export const kartRepoPath = path.join(os.homedir(), '.fu-campus-map', 'data-repository');

/**
 * Initializes Kart by ensuring it is installed and cloning or updating the data repository.
 */
export async function initializeKart() {
  console.log('Checking if Kart is installed...');
  if (!(await isKartInstalled())) {
    throw new Error('Kart is not installed. Please install Kart');
  }

  console.log('Initializing Kart...');
  const kartRepoExists = existsSync(kartRepoPath);
  const remoteUrl = `https://github.com/${process.env.DATA_REPOSITORY}/`;
  const dbUrl = getKartDatabaseConnectionString(true);

  if (!kartRepoExists) {
    // create the directory for the kart repository
    await mkdir(kartRepoPath, { recursive: true });
    console.log(`Created kart repository directory at ${kartRepoPath}`);

    // clone the kart repository
    console.log(` Cloning kart repository from ${remoteUrl} to ${kartRepoPath}...`);
    await exec(`kart clone ${remoteUrl} "${kartRepoPath}" --workingcopy=${dbUrl}`, true, true, '  ');
    console.log('  Cloned kart repository.');
  } else {
    // pull the latest changes
    console.log('  Pulling latest changes to kart repository...');
    await exec(`cd "${kartRepoPath}" && kart fetch`, true, true, '  ');
    await exec(`cd "${kartRepoPath}" && kart reset --discard-changes origin/main`, true, true, '  ');
    console.log('  Pulled latest changes.');
  }
  initEvents.emit('kartdata');

  // generate service directory static files in the background
  generateServiceFiles(constants.campusMapVectorTilesOutputFolder, {
    waysLayers: config.get<string[]>('campusmap.waysLayers'),
  });
}

/**
 * Checks if kart is installed and available.
 */
export async function isKartInstalled() {
  try {
    await exec('which kart');
    return true;
  } catch {
    return false;
  }
}
