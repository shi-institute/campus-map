import { z } from 'zod';

/**
 * Gets the names and encoded pathnames of available Feature Services from the map server
 * for a given folder.
 *
 * @param folder Defaults to '/data' folder on the server services directory.
 */
export async function getAvailableFeatureServices(folder = '/data', abortSignal?: AbortSignal) {
  return fetch(`${import.meta.env.VITE_MAP_SERVER_URL}/rest/services${folder}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: abortSignal,
  })
    .then((res) => res.json())
    .then((json) => responseSchema.parse(json))
    .then((data) => data.services.filter((service) => service.type === 'FeatureServer'))
    .then((data) =>
      data.map((service) => {
        return {
          name: service.name,
          encodedPathname: service.pathname
            .split('/')
            .map((part) => encodeURIComponent(part))
            .join('/'),
        };
      })
    );
}

const serviceSchema = z.object({ name: z.string(), type: z.string(), pathname: z.string() });

const responseSchema = z.object({
  currentVersion: z.number(),
  folders: z.array(z.unknown()),
  services: serviceSchema.array(),
});
