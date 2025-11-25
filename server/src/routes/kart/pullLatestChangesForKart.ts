import { kartRepoPath } from '../../startup/initializeKart.js';
import { exec } from '../../utils/index.js';

export async function pullLatestChangesForKart() {
  await exec(`cd "${kartRepoPath}" && kart fetch`, true, true);
  await exec(`cd "${kartRepoPath}" && kart reset --discard-changes origin/main`, true, true);
}
