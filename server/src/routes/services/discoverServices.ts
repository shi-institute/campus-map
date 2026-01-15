import { existsSync } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';

export const knownServiceTypes = ['VectorTileServer', 'FU.RoutingServer', 'FeatureServer'] as const;

/**
 * Gets child folders from a services directory. A child folder is any folder
 * that does not contain a known service type's `.json` file.
 */
async function getChildFolders(searchDirectory: string) {
  if (existsSync(searchDirectory) === false) {
    return [];
  }

  const directories = await readdir(searchDirectory).then(async (items) => {
    return await Array.fromAsync(items, async (item) => {
      const itemPath = path.join(searchDirectory, item);
      const itemStat = await stat(itemPath);
      return itemStat.isDirectory() ? item : null;
    }).then((results) => results.filter((item): item is string => item !== null));
  });

  // any directory that is not a known service type is a child folder
  const folders: string[] = [];
  for (const dir of directories) {
    // check for any known service type's .json file
    let isServiceType = false;
    for (const serviceType of knownServiceTypes) {
      const indexJsonPath = path.join(searchDirectory, dir, `${serviceType}.json`);
      try {
        await readFile(indexJsonPath, 'utf-8');
        isServiceType = true;
        break;
      } catch {
        // not this service type
      }
    }
    if (!isServiceType) {
      folders.push(dir);
    }
  }

  return folders;
}

interface ServiceInfo {
  /** The name of the service folder */
  name: string;
  /** The path to the service folder on the server's file system */
  path: string;
  /** The pathname to access the service over HTTP requests */
  pathname: string;
  /** The type of service */
  type: 'VectorTileServer' | 'FU.RoutingServer' | 'FeatureServer';
}

interface VectorTileServiceInfo extends ServiceInfo {
  type: 'VectorTileServer';
}

/**
 * Gets tile services names from a services directory.
 */
async function getVectorTileServices(searchDirectory: string, parentPathname: string) {
  if (existsSync(searchDirectory) === false) {
    return [];
  }

  // read the tile services directory
  const directories = await readdir(searchDirectory);

  // treat directories with VectorTileServer.json as vector tile services
  // and all other directories as child folders
  const services: VectorTileServiceInfo[] = [];
  for (const dir of directories) {
    const dirPath = path.join(searchDirectory, dir);
    const indexJsonPath = path.join(dirPath, 'VectorTileServer.json');
    try {
      await readFile(indexJsonPath, 'utf-8');
      services.push({
        name: dir,
        path: dirPath,
        pathname: path.posix.join(parentPathname, dir, 'VectorTileServer'),
        type: 'VectorTileServer',
      });
    } catch {}
  }

  return services;
}

async function getFuRoutingServices(searchDirectory: string, parentPathname: string) {
  if (existsSync(searchDirectory) === false) {
    return [];
  }

  // read the services directory
  const directories = await readdir(searchDirectory);

  // treat directories with FU.RoutingServer.json as routing services
  // and all other directories as child folders
  const services: ServiceInfo[] = [];
  for (const dir of directories) {
    const dirPath = path.join(searchDirectory, dir);
    const indexJsonPath = path.join(dirPath, 'FU.RoutingServer.json');
    try {
      await readFile(indexJsonPath, 'utf-8');
      services.push({
        name: dir,
        path: dirPath,
        pathname: path.posix.join(parentPathname, dir, 'FU.RoutingServer'),
        type: 'FU.RoutingServer',
      });
    } catch {}
  }

  return services;
}

async function getFeatureServices(searchDirectory: string, parentPathname: string) {
  if (existsSync(searchDirectory) === false) {
    return [];
  }

  // read the services directory
  const directories = await readdir(searchDirectory);

  // treat directories with FeatureServer.sub as feature services
  // and all other directories as child folders
  const services: ServiceInfo[] = [];
  for (const dir of directories) {
    const dirPath = path.join(searchDirectory, dir);
    const indexJsonPath = path.join(dirPath, 'FeatureServer.stub');
    try {
      await readFile(indexJsonPath, 'utf-8');
      services.push({
        name: dir,
        path: dirPath,
        pathname: path.posix.join(parentPathname, dir, 'FeatureServer'),
        type: 'FeatureServer',
      });
    } catch {}
  }

  return services;
}

/**
 * Discovers all services in a given directory and its subdirectories.
 */
export async function discoverServices(searchDirectory: string, parentPathname = '/') {
  // get the services in the directory
  const vectorTileServices = await getVectorTileServices(searchDirectory, parentPathname);
  const fuRoutingServices = await getFuRoutingServices(searchDirectory, parentPathname);
  const featureServices = await getFeatureServices(searchDirectory, parentPathname);
  // add additional service types here

  // combine all service types and sort alphabetically
  const allServices: ServiceInfo[] = [...vectorTileServices, ...fuRoutingServices, ...featureServices].sort(
    (a, b) => a.name.localeCompare(b.name)
  );

  // get all services in child folders
  const children = await getChildFolders(searchDirectory).then(async (folders) => {
    const childServices: ServiceInfo[] = [];
    for await (const folder of folders) {
      childServices.push(
        ...(
          await discoverServices(path.join(searchDirectory, folder), path.posix.join(parentPathname, folder))
        ).all
      );
    }
    return childServices;
  });

  return {
    all: [...allServices, ...children],
    /**
     * Gets all services and folders in a given directory.
     */
    forDirectory(relativeDirectory: string) {
      const dirPath = path.join(searchDirectory, relativeDirectory);
      const dirPathParts = dirPath.split(path.sep).filter((part) => part.length > 0);

      // filter services to this directory
      const servicesInDir = this.all.filter((service) => {
        const servicePathParts = service.path.split(path.sep).filter((part) => part.length > 0);
        const isChild =
          service.path.startsWith(dirPath) && servicePathParts.length === dirPathParts.length + 1;
        return isChild;
      });

      // find direct child folders that contain services
      const childFoldersSet = new Set<string>();
      for (const service of this.all) {
        const serviceDir = path.dirname(service.path);
        const isDescendant = serviceDir.startsWith(dirPath);
        if (!isDescendant) {
          continue;
        }

        // get the first child folder (e.g., for /a/b/c/service, in /a, the first child is b)
        const relativeServiceDir = path.relative(dirPath, serviceDir);
        const firstFolder = relativeServiceDir.split(path.sep)[0];
        if (firstFolder) {
          childFoldersSet.add(firstFolder);
        }
      }

      return {
        folders: Array.from(childFoldersSet),
        services: servicesInDir.map((service) => {
          return {
            name: service.name,
            type: service.type,
            pathname: service.pathname || undefined,
          };
        }),
      };
    },
  };
}
