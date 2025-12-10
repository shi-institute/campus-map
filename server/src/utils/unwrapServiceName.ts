/**
 * Unwraps a service name that may be wrapped in data."serviceName" or public."serviceName"
 */
export function unwrapServiceName(serviceName: string): string {
  if (serviceName.startsWith('data."') && serviceName.endsWith('"')) {
    return serviceName.slice(6, -1);
  }

  if (serviceName.startsWith('public."') && serviceName.endsWith('"')) {
    return serviceName.slice(8, -1);
  }

  return serviceName;
}
